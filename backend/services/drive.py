"""Google Drive service — creates per-user folders, uploads files, fetches content.

Falls back to local disk storage when Google OAuth credentials are not available
(e.g. dev-login users or users who haven't connected Google Drive).
"""

from __future__ import annotations

import io
import logging
from datetime import date
from pathlib import Path

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload

from backend.config import get_settings

logger = logging.getLogger(__name__)

APP_DRIVE_FOLDER_NAME = "AI-Financial-Auditor"


def _build_drive_client(access_token: str, refresh_token: str | None = None):
    """Build an authenticated Google Drive API client from stored tokens."""
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
    )
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _get_or_create_folder(service, name: str, parent_id: str | None = None) -> str:
    """Return folder ID for an existing folder, or create it if absent."""
    query = f"name='{name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"

    results = service.files().list(q=query, fields="files(id, name)").execute()
    files = results.get("files", [])

    if files:
        return files[0]["id"]

    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    if parent_id:
        metadata["parents"] = [parent_id]

    folder = service.files().create(body=metadata, fields="id").execute()
    return folder["id"]


def _local_upload(
    user_id: str,
    file_bytes: bytes,
    filename: str,
    upload_date: date | None = None,
) -> dict:
    """Save file to local disk under {storage_path}/{user_id}/{YYYY-MM-DD}/filename.

    Returns dict with drive_file_id (local path), drive_folder_id (dir path),
    drive_web_url (None for local files).
    """
    settings = get_settings()
    date_str = (upload_date or date.today()).strftime("%Y-%m-%d")
    dest_dir = Path(settings.local_storage_path) / user_id / date_str
    dest_dir.mkdir(parents=True, exist_ok=True)

    dest_path = dest_dir / filename
    dest_path.write_bytes(file_bytes)

    logger.info("Saved file locally: %s", dest_path)

    return {
        "drive_file_id": str(dest_path),
        "drive_folder_id": str(dest_dir),
        "drive_web_url": None,
    }


def upload_file(
    access_token: str | None,
    refresh_token: str | None,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    upload_date: date | None = None,
    user_id: str | None = None,
) -> dict:
    """Upload a file to Google Drive, or fall back to local storage.

    When *access_token* is ``None`` or empty the file is saved to local disk
    under ``{local_storage_path}/{user_id}/{YYYY-MM-DD}/`` instead.

    Returns dict with drive_file_id, drive_folder_id, drive_web_url.
    """
    if not access_token:
        if not user_id:
            raise ValueError(
                "user_id is required for local file storage when Google Drive "
                "credentials are not available."
            )
        logger.info("No Google access token — saving file locally for user %s", user_id)
        return _local_upload(user_id, file_bytes, filename, upload_date)

    service = _build_drive_client(access_token, refresh_token)

    date_str = (upload_date or date.today()).strftime("%Y-%m-%d")

    # Ensure folder hierarchy exists: AI-Financial-Auditor/{date}/
    root_folder_id = _get_or_create_folder(service, APP_DRIVE_FOLDER_NAME)
    date_folder_id = _get_or_create_folder(service, date_str, parent_id=root_folder_id)

    # Upload file into the date folder
    file_metadata = {"name": filename, "parents": [date_folder_id]}
    media = MediaIoBaseUpload(
        io.BytesIO(file_bytes), mimetype=mime_type, resumable=True
    )

    uploaded = (
        service.files()
        .create(
            body=file_metadata,
            media_body=media,
            fields="id, webViewLink",
        )
        .execute()
    )

    return {
        "drive_file_id": uploaded["id"],
        "drive_folder_id": date_folder_id,
        "drive_web_url": uploaded.get("webViewLink"),
    }


def fetch_file_bytes(
    access_token: str | None,
    refresh_token: str | None,
    drive_file_id: str,
) -> bytes:
    """Download a file from Google Drive by its file ID, or read from local disk.

    When *access_token* is ``None`` the *drive_file_id* is treated as a local
    file path.
    """
    if not access_token:
        # Local file — drive_file_id is the local path
        logger.info("Reading local file: %s", drive_file_id)
        return Path(drive_file_id).read_bytes()

    service = _build_drive_client(access_token, refresh_token)
    request = service.files().get_media(fileId=drive_file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)

    done = False
    while not done:
        _, done = downloader.next_chunk()

    return buffer.getvalue()
