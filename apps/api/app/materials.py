"""Stateless helper for the material-summarization tool: turns an uploaded
PDF into plain text so it can be handed to the same Ollama `generate()` used
elsewhere. No DB access — this tool doesn't belong to any project.
"""
import io

from pypdf import PdfReader


def extract_text_from_pdf(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    return '\n\n'.join(page.extract_text() or '' for page in reader.pages)


def build_summarize_prompt(text: str) -> str:
    return f'''あなたは編集アシスタントです。次の資料を要約してください。要点を箇条書きで整理し、記事執筆に使える形でまとめてください。\n\n資料:\n{text}\n\n日本語で出力してください。'''
