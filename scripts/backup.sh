#!/bin/bash
set -e

TIMESTAMP=$(date +%Y-%m-%d)
DB_SOURCE="$HOME/financetracker/backend/data/finance.db"
BACKUP_DIR="$HOME/financetracker/backups"
BACKUP_FILE="$BACKUP_DIR/finance-$TIMESTAMP.db"
GDRIVE_PATH="gdrive:Backups/financetracker"
KEEP_DAYS=30

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup..."

# Skip if already backed up today
if [ -f "$BACKUP_FILE" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Already backed up today, skipping."
  exit 0
fi

# Copy database (WAL mode keeps .db file consistent)
cp "$DB_SOURCE" "$BACKUP_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Local copy: $BACKUP_FILE"

# Push to iCloud
rclone copy "$BACKUP_FILE" "$GDRIVE_PATH" --log-level ERROR
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Uploaded to Google Drive: $GDRIVE_PATH"

# Prune local copies older than 7 days
find "$BACKUP_DIR" -name 'finance-*.db' -mtime +$KEEP_DAYS -delete

# Prune iCloud copies older than 7 days
rclone delete "$GDRIVE_PATH" --min-age ${KEEP_DAYS}d --log-level ERROR

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup complete."
