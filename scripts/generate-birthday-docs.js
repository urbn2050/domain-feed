#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const PDFDocument = require('pdfkit');
const { DateTime } = require('luxon');

const TIMEZONE = process.env.TIMEZONE || 'Europe/Zurich';
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR || path.join(process.cwd(), 'output'));
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;
const SPREADSHEET_RANGE = process.env.GOOGLE_SHEETS_RANGE || 'Sheet1!A:Z';

const HEADER_ALIASES = {
  name: ['name', 'fullname', 'vollername'],
  firstName: ['firstname', 'vorname'],
  lastName: ['lastname', 'nachname'],
  birthday: ['birthday', 'geburtstag', 'dob', 'geburtsdatum'],
  address: [
    'address',
    'adresse',
    'adresszeile1',
    'adresszeile2',
    'adresszeile3',
    'addressline1',
    'addressline2',
    'addressline3',
    'adresse1',
    'adresse2',
    'anschrift'
  ],
  street: ['street', 'strasse', 'straße', 'strasen', 'str'],
  postalCode: ['postalcode', 'plz', 'postleitzahl', 'zip', 'zipcode'],
  city: ['city', 'stadt', 'ort', 'ortschaft', 'gemeinde'],
  country: ['country', 'land'],
  bibleVerse: ['bibleverse', 'bibelvers', 'vers', 'bibelstelle', 'losung'],
  greeting: ['greeting', 'gruss', 'gruß', 'grusswort', 'grußwort', 'gratulation', 'nachricht', 'segenswunsch']
};

const BIRTHDAY_FORMATS = [
  { format: 'yyyy-MM-dd', hasYear: true },
  { format: 'dd.MM.yyyy', hasYear: true },
  { format: 'd.M.yyyy', hasYear: true },
  { format: 'dd.MM.yy', hasYear: true },
  { format: 'd.M.yy', hasYear: true },
  { format: 'dd/MM/yyyy', hasYear: true },
  { format: 'd/M/yyyy', hasYear: true },
  { format: 'dd/MM/yy', hasYear: true },
  { format: 'd/M/yy', hasYear: true },
  { format: 'd. MMMM yyyy', hasYear: true },
  { format: 'd. MMM yyyy', hasYear: true },
  { format: 'd. MMMM', hasYear: false },
  { format: 'd. MMM', hasYear: false },
  { format: 'dd.MM.', hasYear: false },
  { format: 'd.M.', hasYear: false },
  { format: 'dd/MM', hasYear: false },
  { format: 'd/M', hasYear: false }
];

const DEFAULT_BIBLE_VERSES = [
  'Denn ich weiß wohl, was ich für Gedanken über euch habe, spricht der HERR: Gedanken des Friedens und nicht des Leides, dass ich euch gebe Zukunft und Hoffnung. (Jeremia 29,11)',
  'Der HERR ist meine Stärke und mein Schild; auf ihn hofft mein Herz, und mir ist geholfen. (Psalm 28,7)',
  'Der HERR segne dich und behüte dich; der HERR lasse sein Angesicht leuchten über dir und sei dir gnädig. (4. Mose 6,24-25)',
  'Gott ist unsere Zuflucht und Stärke, eine Hilfe in Nöten, wohl bewährt. (Psalm 46,2)',
  'Denn du bist meine Zuversicht, HERR; du bist meine Hoffnung von Jugend auf. (Psalm 71,5)'
];

const DEFAULT_GREETINGS = [
  (entry) => `Liebe(r) ${entry.firstName || entry.name}, möge Gottes Güte dich an deinem Geburtstag ganz besonders umgeben und dir neue Kraft schenken.`,
  (entry) => `Herzlichen Glückwunsch, ${entry.firstName || entry.name}! Wir freuen uns mit dir und beten, dass du in diesem neuen Lebensjahr Gottes Nähe ganz intensiv erlebst.`,
  (entry) => `${entry.firstName || entry.name}, von Herzen alles Gute! Möge der Herr dir Weisheit, Freude und Mut für jeden Tag schenken.`,
  (entry) => `Zum Geburtstag wünschen wir dir, ${entry.firstName || entry.name}, dass du überreich beschenkt wirst mit Segen, Frieden und liebevollen Momenten.`,
  (entry) => `Gesegneten Geburtstag, ${entry.firstName || entry.name}! Gott halte seine schützende Hand über dir und erfülle dein Herz mit Hoffnung.`
];

async function main() {
  try {
    if (!SPREADSHEET_ID) {
      throw new Error('Environment variable GOOGLE_SHEETS_ID is missing.');
    }

    const entries = await fetchSheetEntries();
    const { matches, weekStart, weekEnd } = filterBirthdaysThisWeek(entries);

    if (!matches.length) {
      console.log(
        `Keine Geburtstage zwischen ${weekStart.toFormat('dd.MM.yyyy')} und ${weekEnd.toFormat('dd.MM.yyyy')}.`
      );
      return;
    }

    const enriched = enrichEntries(matches);

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const envelopePath = await generateEnvelopePdf(enriched, weekStart, weekEnd);
    const greetingPath = await generateGreetingPdf(enriched, weekStart, weekEnd);

    console.log('Fertig!');
    console.log(`C5-Couverts: ${envelopePath}`);
    console.log(`Geburtstagsgrüsse: ${greetingPath}`);
  } catch (error) {
    console.error('Fehler:', error.message);
    process.exitCode = 1;
  }
}

function simplify(text) {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function buildHeaderMap(headers) {
  const result = {};
  headers.forEach((header, index) => {
    const simplified = simplify(header);
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(simplified)) {
        if (key === 'address') {
          if (!result[key]) {
            result[key] = [];
          }
          result[key].push(index);
        } else if (result[key] === undefined) {
          result[key] = index;
        }
        return;
      }
    }
  });
  return { map: result, headers };
}

function getValue(row, headerMap, key) {
  const index = headerMap.map[key];
  if (index === undefined) {
    return '';
  }
  if (Array.isArray(index)) {
    return index
      .map((idx) => (row[idx] || '').toString().trim())
      .filter(Boolean)
      .join('\n');
  }
  return (row[index] || '').toString().trim();
}

async function fetchSheetEntries() {
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
  });

  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SPREADSHEET_RANGE,
    valueRenderOption: 'FORMATTED_VALUE'
  });

  const rows = response.data.values || [];
  if (!rows.length) {
    return [];
  }

  const headerInfo = buildHeaderMap(rows[0]);
  return rows.slice(1).map((row, index) => parseRow(row, headerInfo, index + 2)).filter(Boolean);
}

function parseRow(row, headerInfo, rowNumber) {
  const firstName = getValue(row, headerInfo, 'firstName');
  const lastName = getValue(row, headerInfo, 'lastName');
  let name = getValue(row, headerInfo, 'name');

  if (!name) {
    name = [firstName, lastName].filter(Boolean).join(' ').trim();
  }

  if (!name) {
    console.warn(`Zeile ${rowNumber} wird übersprungen: Kein Name vorhanden.`);
    return null;
  }

  const birthdayRaw = getValue(row, headerInfo, 'birthday');
  const birthday = parseBirthday(birthdayRaw, rowNumber, name);

  if (!birthday) {
    console.warn(`Zeile ${rowNumber} (${name}) wird übersprungen: Geburtstag konnte nicht gelesen werden.`);
    return null;
  }

  const bibleVerse = getValue(row, headerInfo, 'bibleVerse');
  const greeting = getValue(row, headerInfo, 'greeting');

  const addressLines = collectAddressLines(row, headerInfo);

  return {
    name,
    firstName,
    lastName,
    birthday,
    bibleVerse,
    greeting,
    addressLines,
    rowNumber
  };
}

function collectAddressLines(row, headerInfo) {
  const lines = [];
  const fullName = getValue(row, headerInfo, 'name')
    || [getValue(row, headerInfo, 'firstName'), getValue(row, headerInfo, 'lastName')]
      .filter(Boolean)
      .join(' ')
      .trim();

  const address = getValue(row, headerInfo, 'address');
  const street = getValue(row, headerInfo, 'street');
  const postalCode = getValue(row, headerInfo, 'postalCode');
  const city = getValue(row, headerInfo, 'city');
  const country = getValue(row, headerInfo, 'country');

  if (address) {
    address
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => lines.push(line));
  }

  if (street && !lines.some((line) => simplify(line) === simplify(street))) {
    lines.push(street);
  }

  const cityLine = [postalCode, city].filter(Boolean).join(' ').trim();
  if (cityLine) {
    lines.push(cityLine);
  }

  if (country) {
    lines.push(country);
  }

  const uniqueLines = Array.from(new Set(lines.filter(Boolean)));
  if (fullName) {
    const normalizedName = simplify(fullName);
    return uniqueLines.filter((line) => simplify(line) !== normalizedName);
  }
  return uniqueLines;
}

function parseBirthday(value, rowNumber, name) {
  if (!value) {
    return null;
  }

  const trimmed = value.toString().trim();
  if (!trimmed) {
    return null;
  }

  const iso = DateTime.fromISO(trimmed, { zone: TIMEZONE, locale: 'de-CH' });
  if (iso.isValid) {
    return { month: iso.month, day: iso.day, year: iso.year, raw: trimmed };
  }

  for (const { format, hasYear } of BIRTHDAY_FORMATS) {
    const parsed = DateTime.fromFormat(trimmed, format, {
      zone: TIMEZONE,
      locale: 'de-CH'
    });
    if (parsed.isValid) {
      return {
        month: parsed.month,
        day: parsed.day,
        year: hasYear ? parsed.year : null,
        raw: trimmed
      };
    }
  }

  const match = trimmed.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : null;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return { month, day, year, raw: trimmed };
    }
  }

  console.warn(`Geburtstag konnte nicht interpretiert werden (Zeile ${rowNumber}, ${name}): "${trimmed}".`);
  return null;
}

function filterBirthdaysThisWeek(entries) {
  const now = DateTime.now().setZone(TIMEZONE);
  const weekStart = now.startOf('week');
  const weekEnd = weekStart.plus({ days: 6 }).endOf('day');

  const matches = entries
    .map((entry) => {
      const celebrationDate = resolveCelebrationDate(entry.birthday, weekStart, weekEnd);
      if (!celebrationDate) {
        return null;
      }
      return {
        ...entry,
        celebrationDate
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.celebrationDate < b.celebrationDate) return -1;
      if (a.celebrationDate > b.celebrationDate) return 1;
      return a.name.localeCompare(b.name, 'de');
    });

  return { matches, weekStart, weekEnd };
}

function resolveCelebrationDate(birthday, weekStart, weekEnd) {
  if (!birthday) {
    return null;
  }

  const yearsToCheck = new Set([weekStart.year, weekEnd.year]);
  if (birthday.year) {
    yearsToCheck.add(birthday.year);
  }

  for (const year of yearsToCheck) {
    let candidate = DateTime.fromObject(
      { year, month: birthday.month, day: birthday.day },
      { zone: weekStart.zoneName }
    );

    if (!candidate.isValid && birthday.month === 2 && birthday.day === 29) {
      candidate = DateTime.fromObject({ year, month: 2, day: 28 }, { zone: weekStart.zoneName });
    }

    if (!candidate.isValid) {
      continue;
    }

    if (candidate >= weekStart.startOf('day') && candidate <= weekEnd) {
      return candidate;
    }
  }

  return null;
}

function enrichEntries(entries) {
  return entries.map((entry, index) => {
    const verse = entry.bibleVerse && entry.bibleVerse.trim()
      ? entry.bibleVerse.trim()
      : DEFAULT_BIBLE_VERSES[index % DEFAULT_BIBLE_VERSES.length];

    let greeting = entry.greeting && entry.greeting.trim() ? entry.greeting.trim() : null;
    if (greeting) {
      greeting = greeting
        .replace(/{{\s*name\s*}}/gi, entry.name)
        .replace(/{{\s*vorname\s*}}/gi, entry.firstName || entry.name);
    } else {
      const template = DEFAULT_GREETINGS[index % DEFAULT_GREETINGS.length];
      greeting = typeof template === 'function' ? template(entry) : template;
    }

    return {
      ...entry,
      bibleVerseResolved: verse,
      greetingResolved: greeting
    };
  });
}

function mmToPt(mm) {
  return (mm / 25.4) * 72;
}

function generateEnvelopePdf(entries, weekStart, weekEnd) {
  const filename = `c5-couverts-${weekStart.toFormat('yyyyLLdd')}-${weekEnd.toFormat('yyyyLLdd')}.pdf`;
  const filePath = path.join(OUTPUT_DIR, filename);

  const pageSize = [mmToPt(229), mmToPt(162)];
  const marginLeft = mmToPt(25);
  const marginTop = mmToPt(45);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: pageSize });
    const stream = fs.createWriteStream(filePath);
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    entries.forEach((entry, index) => {
      if (index > 0) {
        doc.addPage({ size: pageSize });
      }

      let y = marginTop;
      doc.font('Helvetica-Bold').fontSize(14);
      doc.text(entry.name, marginLeft, y);
      y = doc.y + 6;

      doc.font('Helvetica').fontSize(12);
      entry.addressLines.forEach((line) => {
        doc.text(line, marginLeft, y);
        y = doc.y + 4;
      });

      doc.font('Helvetica-Oblique').fontSize(10).fillColor('#555555');
      doc.text(`Geburtstag: ${entry.celebrationDate.toFormat('dd.MM.yyyy')}`, marginLeft, y + 6);
      doc.fillColor('#000000');
    });

    doc.end();
  });
}

function generateGreetingPdf(entries, weekStart, weekEnd) {
  const filename = `geburtstagsgruesse-${weekStart.toFormat('yyyyLLdd')}-${weekEnd.toFormat('yyyyLLdd')}.pdf`;
  const filePath = path.join(OUTPUT_DIR, filename);

  const margins = {
    top: mmToPt(20),
    bottom: mmToPt(20),
    left: mmToPt(25),
    right: mmToPt(25)
  };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins
    });

    const stream = fs.createWriteStream(filePath);
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    const columnGap = mmToPt(18);
    const usableWidth = doc.page.width - margins.left - margins.right;
    const columnWidth = (usableWidth - columnGap) / 2;
    const maxY = doc.page.height - margins.bottom;
    let cursorY = margins.top;

    entries.forEach((entry, index) => {
      const header = `${entry.name} – ${entry.celebrationDate.toFormat('dd.MM.yyyy')}`;

      doc.font('Helvetica-Bold').fontSize(12);
      const headerHeight = doc.heightOfString(header, {
        width: columnWidth * 2 + columnGap
      });

      doc.font('Helvetica-Oblique').fontSize(11);
      const verseHeight = doc.heightOfString(entry.bibleVerseResolved, {
        width: columnWidth,
        lineGap: 4
      });

      doc.font('Helvetica').fontSize(11);
      const greetingHeight = doc.heightOfString(entry.greetingResolved, {
        width: columnWidth,
        lineGap: 4
      });

      const blockHeight = headerHeight + mmToPt(3) + Math.max(verseHeight, greetingHeight) + mmToPt(6);

      if (cursorY + blockHeight > maxY) {
        doc.addPage({ size: 'A4', layout: 'landscape', margins });
        cursorY = margins.top;
      }

      doc.font('Helvetica-Bold').fontSize(12);
      doc.text(header, margins.left, cursorY, {
        width: columnWidth * 2 + columnGap
      });

      const textTop = doc.y + mmToPt(3);

      doc.font('Helvetica-Oblique').fontSize(11);
      doc.text(entry.bibleVerseResolved, margins.left, textTop, {
        width: columnWidth,
        lineGap: 4
      });

      doc.font('Helvetica').fontSize(11);
      doc.text(entry.greetingResolved, margins.left + columnWidth + columnGap, textTop, {
        width: columnWidth,
        lineGap: 4
      });

      cursorY = textTop + Math.max(verseHeight, greetingHeight) + mmToPt(6);
    });

    doc.end();
  });
}

function getServiceAccountCredentials() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

  if (!clientEmail || !privateKeyRaw) {
    throw new Error(
      'Service-Account-Zugangsdaten fehlen. Bitte GOOGLE_SERVICE_ACCOUNT_EMAIL und GOOGLE_PRIVATE_KEY setzen.'
    );
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
  return { clientEmail, privateKey };
}

main();
