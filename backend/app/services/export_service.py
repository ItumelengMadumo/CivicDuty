"""
Export service for generating authority data packages.
"""
from datetime import datetime, timedelta
from typing import Optional, List
import uuid
import io
import csv

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image

from app.models.export import Export, ExportFormat, ExportStatus
from app.models.report import Report, ReportStatus, ReportCategory
from app.models.user import User
from app.services.media_service import media_service
from app.core.config import settings


class ExportService:
    """Service for generating export packages."""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_export(
        self,
        user_id: uuid.UUID,
        name: str,
        format: ExportFormat,
        description: Optional[str] = None,
        categories: Optional[List[ReportCategory]] = None,
        statuses: Optional[List[ReportStatus]] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        min_score: Optional[float] = None,
        bounds: Optional[dict] = None
    ) -> Export:
        """Create a new export request."""
        export = Export(
            created_by_id=user_id,
            name=name,
            description=description,
            format=format,
            categories=[c.value for c in categories] if categories else None,
            statuses=[s.value for s in statuses] if statuses else None,
            date_from=date_from,
            date_to=date_to,
            min_score=min_score,
            bounds=bounds,
            status=ExportStatus.PENDING
        )
        
        self.db.add(export)
        await self.db.commit()
        await self.db.refresh(export)
        
        return export
    
    async def process_export(self, export_id: uuid.UUID) -> Export:
        """Process an export request and generate the file."""
        export = await self.db.get(Export, export_id)
        if not export:
            raise ValueError("Export not found")
        
        # Update status to processing
        export.status = ExportStatus.PROCESSING
        export.started_at = datetime.utcnow()
        await self.db.commit()
        
        try:
            # Fetch matching reports
            reports = await self._fetch_reports(export)
            export.report_count = len(reports)
            export.report_ids = [str(r.id) for r in reports]
            
            # Generate file based on format
            if export.format == ExportFormat.PDF:
                content, content_type = await self._generate_pdf(reports, export.name)
            elif export.format == ExportFormat.CSV:
                content, content_type = await self._generate_csv(reports)
            else:  # JSON
                content, content_type = await self._generate_json(reports)
            
            # Upload to S3
            key = f"exports/{export_id}.{export.format.value}"
            await media_service.upload_media(export_id, content, content_type)
            
            export.file_key = key
            export.file_size = len(content)
            export.status = ExportStatus.COMPLETED
            export.completed_at = datetime.utcnow()
            export.expires_at = datetime.utcnow() + timedelta(days=7)
            
        except Exception as e:
            export.status = ExportStatus.FAILED
            export.error_message = str(e)
        
        await self.db.commit()
        await self.db.refresh(export)
        
        return export
    
    async def get_download_url(self, export_id: uuid.UUID) -> Optional[str]:
        """Get download URL for a completed export."""
        export = await self.db.get(Export, export_id)
        if not export or not export.file_key:
            return None
        
        if export.expires_at and export.expires_at < datetime.utcnow():
            return None
        
        return media_service.generate_download_url(export.file_key)
    
    async def list_exports(
        self,
        user_id: uuid.UUID,
        page: int = 1,
        page_size: int = 20
    ) -> List[Export]:
        """List exports for a user."""
        result = await self.db.execute(
            select(Export)
            .where(Export.created_by_id == user_id)
            .order_by(Export.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all())
    
    async def _fetch_reports(self, export: Export) -> List[Report]:
        """Fetch reports matching export criteria."""
        query = select(Report)
        conditions = []
        
        # Only include high-quality reports
        conditions.append(Report.status.in_([
            ReportStatus.COMMUNITY_CONFIRMED,
            ReportStatus.ESCALATED,
            ReportStatus.ACKNOWLEDGED
        ]))
        
        if export.min_score:
            conditions.append(Report.total_score >= export.min_score)
        else:
            conditions.append(Report.total_score >= settings.SCORE_ESCALATION_THRESHOLD)
        
        if export.categories:
            conditions.append(Report.category.in_([
                ReportCategory(c) for c in export.categories
            ]))
        
        if export.statuses:
            conditions.append(Report.status.in_([
                ReportStatus(s) for s in export.statuses
            ]))
        
        if export.date_from:
            conditions.append(Report.created_at >= export.date_from)
        
        if export.date_to:
            conditions.append(Report.created_at <= export.date_to)
        
        if export.bounds:
            conditions.append(Report.latitude <= export.bounds.get('north', 90))
            conditions.append(Report.latitude >= export.bounds.get('south', -90))
            conditions.append(Report.longitude <= export.bounds.get('east', 180))
            conditions.append(Report.longitude >= export.bounds.get('west', -180))
        
        query = query.where(and_(*conditions))
        query = query.order_by(Report.total_score.desc())
        query = query.limit(1000)  # Safety limit
        
        result = await self.db.execute(query)
        return list(result.scalars().all())
    
    async def _generate_pdf(self, reports: List[Report], title: str) -> tuple[bytes, str]:
        """Generate a PDF evidence pack."""
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Title'],
            fontSize=24,
            spaceAfter=30
        )
        
        elements = []
        
        # Title
        elements.append(Paragraph(title, title_style))
        elements.append(Paragraph(
            f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            styles['Normal']
        ))
        elements.append(Paragraph(f"Total Reports: {len(reports)}", styles['Normal']))
        elements.append(Spacer(1, 30))
        
        # Summary table
        summary_data = [
            ['Category', 'Count'],
        ]
        category_counts = {}
        for report in reports:
            cat = report.category.value
            category_counts[cat] = category_counts.get(cat, 0) + 1
        
        for cat, count in sorted(category_counts.items()):
            summary_data.append([cat.replace('_', ' ').title(), str(count)])
        
        summary_table = Table(summary_data, colWidths=[200, 100])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 30))
        
        # Individual reports
        for i, report in enumerate(reports[:50], 1):  # Limit to 50 for PDF
            elements.append(Paragraph(
                f"Report #{i}: {report.category.value.replace('_', ' ').title()}",
                styles['Heading2']
            ))
            
            elements.append(Paragraph(
                f"<b>Location:</b> {report.latitude:.6f}, {report.longitude:.6f}",
                styles['Normal']
            ))
            elements.append(Paragraph(
                f"<b>Reported:</b> {report.created_at.strftime('%Y-%m-%d %H:%M')}",
                styles['Normal']
            ))
            elements.append(Paragraph(
                f"<b>Score:</b> {report.total_score:.1f}",
                styles['Normal']
            ))
            elements.append(Paragraph(
                f"<b>Confirmations:</b> {report.confirmation_count}",
                styles['Normal']
            ))
            
            if report.description:
                elements.append(Paragraph(
                    f"<b>Description:</b> {report.description}",
                    styles['Normal']
                ))
            
            elements.append(Spacer(1, 20))
        
        doc.build(elements)
        return buffer.getvalue(), 'application/pdf'
    
    async def _generate_csv(self, reports: List[Report]) -> tuple[bytes, str]:
        """Generate a CSV export."""
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        writer.writerow([
            'ID', 'Category', 'Status', 'Latitude', 'Longitude',
            'Description', 'Score', 'Confirmations', 'Flags',
            'Created At', 'Media Count'
        ])
        
        # Data rows
        for report in reports:
            writer.writerow([
                str(report.id),
                report.category.value,
                report.status.value,
                report.latitude,
                report.longitude,
                report.description or '',
                report.total_score,
                report.confirmation_count,
                report.flag_count,
                report.created_at.isoformat(),
                len(report.media) if report.media else 0
            ])
        
        return output.getvalue().encode('utf-8'), 'text/csv'
    
    async def _generate_json(self, reports: List[Report]) -> tuple[bytes, str]:
        """Generate a JSON export."""
        import json
        
        data = {
            'generated_at': datetime.utcnow().isoformat(),
            'total_count': len(reports),
            'reports': [
                {
                    'id': str(report.id),
                    'category': report.category.value,
                    'status': report.status.value,
                    'location': {
                        'latitude': report.latitude,
                        'longitude': report.longitude,
                        'accuracy': report.location_accuracy,
                        'address': report.address
                    },
                    'description': report.description,
                    'score': {
                        'total': report.total_score,
                        'base': report.base_score,
                        'evidence': report.evidence_score,
                        'community': report.community_score
                    },
                    'confirmations': report.confirmation_count,
                    'flags': report.flag_count,
                    'captured_at': report.captured_at.isoformat() if report.captured_at else None,
                    'created_at': report.created_at.isoformat()
                }
                for report in reports
            ]
        }
        
        return json.dumps(data, indent=2).encode('utf-8'), 'application/json'
