
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel
from pypdf import PdfReader
from docx import Document

from chunking import split_text

app = FastAPI(
    title="EnterpriseMind AI Service",
    description="Document processing and RAG service",
    version="0.3.0",
)

MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


class HealthResponse(BaseModel):
    status: str
    service: str


class DocumentResponse(BaseModel):
    filename: str
    file_type: str
    size_bytes: int
    characters: int
    words: int
    text: str
    status: str
    document_id: str
    chunk_count: int
    chunks: list[dict]


@app.get("/api/health", response_model=HealthResponse)
def health_check():
    return HealthResponse(
        status="UP",
        service="EnterpriseMind AI Service",
    )


def extract_text(filename: str, content: bytes) -> str:
    extension = Path(filename).suffix.lower()

    try:
        if extension == ".txt":
            try:
                return content.decode("utf-8-sig")
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=422,
                    detail="TXT file must use UTF-8 encoding",
                )

        if extension == ".pdf":
            reader = PdfReader(BytesIO(content))

            if reader.is_encrypted:
                raise HTTPException(
                    status_code=422,
                    detail="Encrypted PDFs are not supported",
                )

            pages = [
                page.extract_text() or ""
                for page in reader.pages
            ]
            return "\n\n".join(pages)

        if extension == ".docx":
            document = Document(BytesIO(content))

            paragraphs = [
                p.text
                for p in document.paragraphs
                if p.text.strip()
            ]

            for table in document.tables:
                for row in table.rows:
                    cells = [cell.text for cell in row.cells]
                    paragraphs.append(" | ".join(cells))

            return "\n".join(paragraphs)

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=422,
            detail="Unable to parse document",
        )

    raise HTTPException(
        status_code=415,
        detail="Unsupported file format",
    )


@app.post(
    "/api/documents/parse",
    response_model=DocumentResponse,
)
async def parse_document(file: UploadFile = File(...)):
    filename = file.filename or ""
    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Only PDF, DOCX and TXT are supported",
        )

    content = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if not content:
        raise HTTPException(
            status_code=400,
            detail="File is empty",
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File exceeds 20 MB limit",
        )

    text = extract_text(filename, content)

    if not text.strip():
        raise HTTPException(
            status_code=422,
            detail="No extractable text found",
        )

    document_id = str(uuid4())

    chunks = split_text(
        text=text,
        document_id=document_id,
        chunk_size=500,
        chunk_overlap=100,
    )

    return DocumentResponse(
        filename=filename,
        file_type=extension.lstrip("."),
        size_bytes=len(content),
        characters=len(text),
        words=len(text.split()),
        text=text,
        status="PARSED",
        document_id=document_id,
        chunk_count=len(chunks),
        chunks=chunks,
    )
