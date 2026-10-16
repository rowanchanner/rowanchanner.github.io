/* region.js — which country's charts to show.
 *
 * There is no location permission on a television and no geo-IP service worth
 * adding, so the country is worked out from what the device already says about
 * itself: the language it is set to ("en-GB" -> GB), and failing that its time
 * zone ("Europe/London" -> GB). Both are set by whoever set the telly up, so
 * they are usually right, and Settings can override it when they are not.
 */
(function (w) {
  'use strict';

  /* Time zones only need to cover the countries a person is plausibly in;
     anything unknown falls back to the language, and then to GB. */
  var ZONE_COUNTRY = {
    'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR',
    'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT',
    'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Lisbon': 'PT',
    'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
    'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
    'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Athens': 'GR',
    'Europe/Moscow': 'RU', 'Europe/Istanbul': 'TR',
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
    'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
    'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR',
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU',
    'Australia/Brisbane': 'AU', 'Pacific/Auckland': 'NZ',
    'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN',
    'Asia/Hong_Kong': 'HK', 'Asia/Singapore': 'SG', 'Asia/Kolkata': 'IN',
    'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Africa/Johannesburg': 'ZA',
    'Africa/Lagos': 'NG', 'Africa/Cairo': 'EG'
  };

  /* The countries TMDB has decent streaming coverage for, which is what the
     Top 10 rows are actually built from. */
  var NAMES = {
    GB: 'the UK',       IE: 'Ireland',      US: 'the US',      CA: 'Canada',
    AU: 'Australia',    NZ: 'New Zealand',  FR: 'France',      DE: 'Germany',
    ES: 'Spain',        IT: 'Italy',        NL: 'the Netherlands', BE: 'Belgium',
    PT: 'Portugal',     SE: 'Sweden',       NO: 'Norway',      DK: 'Denmark',
    FI: 'Finland',      PL: 'Poland',       CZ: 'Czechia',     AT: 'Austria',
    CH: 'Switzerland',  GR: 'Greece',       TR: 'Turkey',      RU: 'Russia',
    MX: 'Mexico',       BR: 'Brazil',       AR: 'Argentina',   JP: 'Japan',
    KR: 'South Korea',  CN: 'China',        HK: 'Hong Kong',   SG: 'Singapore',
    IN: 'India',        AE: 'the UAE',      ZA: 'South Africa', NG: 'Nigeria',
    EG: 'Egypt'
  };

  /* Offered in Settings. Kept short: a long list is miserable on a remote. */
  var PICKABLE = ['GB', 'IE', 'US', 'CA', 'AU', 'NZ', 'FR', 'DE', 'ES', 'IT',
                  'NL', 'SE', 'NO', 'DK', 'PL', 'PT', 'BR', 'MX', 'IN', 'JP', 'ZA'];

  function fromLanguage() {
    var langs = [];
    try {
      if (navigator.languages && navigator.languages.length) {
        langs = [].slice.call(navigator.languages);
      } else if (navigator.language) {
        langs = [navigator.language];
      }
    } catch (e) {}
    for (var i = 0; i < langs.length; i++) {
      var m = /[-_]([A-Za-z]{2})$/.exec(langs[i] || '');
      if (m) {
        var cc = m[1].toUpperCase();
        if (NAMES[cc]) return cc;
      }
    }
    return '';
  }

  function fromTimeZone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && ZONE_COUNTRY[tz]) return ZONE_COUNTRY[tz];
    } catch (e) {}
    return '';
  }

  function detect() {
    return fromLanguage() || fromTimeZone() || 'GB';
  }

  w.Region = {
    detect: detect,
    /* What the rows are titled with: "Top 10 Films in the UK Today". */
    name: function (cc) { return NAMES[cc] || cc || 'your country'; },
    known: function (cc) { return !!NAMES[cc]; },
    list: function () {
      return PICKABLE.map(function (cc) { return { code: cc, name: NAMES[cc] }; });
    },
    /* Only for the "detected" note in Settings. */
    how: function () {
      if (fromLanguage()) return 'from this device\'s language';
      if (fromTimeZone()) return 'from this device\'s time zone';
      return 'a default';
    }
  };
})(window);
