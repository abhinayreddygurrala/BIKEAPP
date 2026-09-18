#!/bin/bash
# Runs weekly via a macOS LaunchAgent (see scripts/com.bikeapp.weeklybackup.plist).
# Commits any pending local work, pushes the current branch, and — if
# anything actually changed since last week's snapshot — cuts a new
# weekN branch and pushes that too.
set -uo pipefail

PROJECT_DIR="/Users/abhinaygurrala/Projects/BIKEAPP"
LOG="$PROJECT_DIR/.git/weekly-backup.log"

cd "$PROJECT_DIR" || exit 1
{
  echo "=== $(date) ==="

  if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "Weekly backup - $(date +%Y-%m-%d)"
  else
    echo "Nothing uncommitted."
  fi

  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git push origin "$CURRENT_BRANCH" || echo "Push of $CURRENT_BRANCH failed (offline?) — will retry next week."

  LAST_WEEK=$(git branch -a | grep -oE 'week[0-9]+' | grep -oE '[0-9]+' | sort -n | tail -1)
  LAST_WEEK=${LAST_WEEK:-0}
  LAST_BRANCH="week${LAST_WEEK}"
  NEXT_BRANCH="week$((LAST_WEEK + 1))"

  if git rev-parse --verify "$LAST_BRANCH" >/dev/null 2>&1 && [ -z "$(git diff "$LAST_BRANCH" HEAD)" ]; then
    echo "No changes since $LAST_BRANCH — skipping a new snapshot branch this week."
  else
    git branch "$NEXT_BRANCH"
    git push -u origin "$NEXT_BRANCH"
    echo "Created and pushed $NEXT_BRANCH"
  fi

  echo "Done."
} >> "$LOG" 2>&1
