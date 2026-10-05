/**
 * App settings.
 *
 * `feedFormat: 'bmlt'` reads a BMLT root server's GetSearchResults JSON.
 * `feedFormat: 'meeting-guide'` reads a Meeting Guide / 12 Step Meeting List feed.
 */
export const SETTINGS = {
  title: 'Find an NA Meeting',
  feedFormat: 'bmlt' as 'bmlt' | 'meeting-guide',
  feedUrl:
    'https://todayna.org/bmlt/client_interface/json/?switcher=GetSearchResults' +
    '&services[]=-1054&services[]=-1055&services[]=-1056',
  /**
   * BMLT only: also ask the server for the format names it uses (get_used_formats=1),
   * so type labels match the region's own wording.
   */
  bmltFormatLabels: true,
  /**
   * Tried if the direct request fails (e.g. the server stops sending CORS headers).
   * Relative to <base href>, so with the /na/ build this is https://matthews.help/na/feed.json,
   * served by the nginx proxy in deploy/nginx-na.conf. Set to null to disable.
   */
  fallbackFeedUrl: 'feed.json' as string | null,
  /** Label for the region column/filter. BMLT feeds use the meeting's city as its region. */
  regionLabel: 'City',
  /** First day of the week in the day dropdown: 0 = Sunday, 1 = Monday */
  weekStart: 0,
  /** Day to show when no ?day= is in the URL: 'today' or 'any' */
  defaultDay: 'today' as 'today' | 'any',
  /** IANA time zone for meetings that don't carry their own. */
  timezone: 'America/Los_Angeles',
};
