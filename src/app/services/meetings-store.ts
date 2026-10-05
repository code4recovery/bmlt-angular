import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Params } from '@angular/router';
import { Meeting, RawMeeting } from '../models/meeting';
import { normalizeMeetings } from '../models/normalize';
import { ATTENDANCE_CODES, registerTypeLabels, typeLabel } from '../models/meeting-types';
import { parseBmltResponse } from '../models/bmlt';
import { SETTINGS } from '../settings';

@Injectable({ providedIn: 'root' })
export class MeetingsStore {
  private http = inject(HttpClient);

  readonly meetings = signal<Meeting[]>([]);
  readonly status = signal<'loading' | 'ready' | 'error'>('loading');
  readonly errorMessage = signal<string | null>(null);

  /** Last list query params, so detail pages can link back to the same filtered view. */
  readonly lastListParams = signal<Params>({});

  /** Top-level regions (cities for BMLT feeds) present in the data. */
  readonly regions = computed(() =>
    [...new Set(this.meetings().map((m) => m.region?.split(' › ')[0]).filter((r): r is string => !!r))].sort(
      (a, b) => a.localeCompare(b)
    )
  );

  /** Content types present in the data, sorted by label (attendance codes excluded). */
  readonly availableTypes = computed(() =>
    [...new Set(this.meetings().flatMap((m) => m.types))]
      .filter((t) => !ATTENDANCE_CODES.has(t))
      .sort((a, b) => typeLabel(a).localeCompare(typeLabel(b)))
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.status.set('loading');
    this.fetch(this.requestUrl(SETTINGS.feedUrl), SETTINGS.fallbackFeedUrl);
  }

  /** All occurrences of a meeting (one per day). */
  bySlug(slug: string): Meeting[] {
    return this.meetings().filter((m) => m.slug === slug);
  }

  private requestUrl(url: string): string {
    if (SETTINGS.feedFormat !== 'bmlt' || !SETTINGS.bmltFormatLabels || /[?&]get_used_formats=/.test(url)) return url;
    return url + (url.includes('?') ? '&' : '?') + 'get_used_formats=1';
  }

  private fetch(url: string, fallback: string | null): void {
    this.http.get<unknown>(url).subscribe({
      next: (body) => {
        const raw = this.parse(body);
        if (!raw) {
          this.fail('The meeting feed did not return a list of meetings.');
          return;
        }
        this.meetings.set(normalizeMeetings(raw));
        this.status.set('ready');
      },
      error: (err) => {
        if (fallback) {
          console.warn(`Meeting feed ${url} failed (${err.status || 'network/CORS'}); trying ${fallback}`);
          this.fetch(fallback, null);
          return;
        }
        this.fail(`Couldn't load meetings (${err.status || 'network error'}). Please try again in a moment.`);
      },
    });
  }

  private parse(body: unknown): RawMeeting[] | null {
    if (SETTINGS.feedFormat === 'bmlt') {
      const parsed = parseBmltResponse(body);
      if (!parsed) return null;
      registerTypeLabels(parsed.labels);
      return parsed.meetings;
    }
    return Array.isArray(body) ? (body as RawMeeting[]) : null;
  }

  private fail(msg: string) {
    this.errorMessage.set(msg);
    this.status.set('error');
  }
}
