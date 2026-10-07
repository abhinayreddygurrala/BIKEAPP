/**
 * A daily allowance of bytes, per account and for everyone together. The
 * server uses it to cap what it hands out for download, because outbound
 * traffic is the one cost here with no ceiling of its own: Google bills it
 * per GB past the free tier. Kept in memory (one server; a restart just
 * starts the day's count over) and reset at midnight UTC.
 */
export class DailyAllowance {
  private day = '';
  private total = 0;
  private readonly used = new Map<string, number>();

  constructor(
    private readonly perUser: number,
    private readonly overall: number
  ) {}

  /** Counts `bytes` against today's allowance; false (and nothing counted) if that would go over. */
  take(userId: string, bytes: number): boolean {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.total = 0;
      this.used.clear();
    }
    const mine = this.used.get(userId) ?? 0;
    if (mine + bytes > this.perUser || this.total + bytes > this.overall) return false;
    this.used.set(userId, mine + bytes);
    this.total += bytes;
    return true;
  }
}
