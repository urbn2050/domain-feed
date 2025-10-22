## Deploy JSON Server to Vercel

A template to deploy [JSON Server](https://github.com/typicode/json-server) to [Vercel](https://vercel.com), allow you to run fake REST API online!

Demo from this repository: 

1. https://json-server-in.vercel.app
2. https://json-server-in.vercel.app/api/posts

![Powered by Vercel](https://images.ctfassets.net/e5382hct74si/78Olo8EZRdUlcDUFQvnzG7/fa4cdb6dc04c40fceac194134788a0e2/1618983297-powered-by-vercel.svg)

### How to use

1. Click "**Use this template**" or clone this repository.
2. Update or use the default [`db.json`](./db.json) in the repository.
3. Sign Up or login into [Vercel](https://vercel.com).
4. From the Vercel dashboard, click "**+ New Project**" then "**Import**" your repository.
5. In the "**Configure Project**" screen, leave everything default and click "**Deploy**".
6. Wait until deployment is done, and your own JSON server is ready to serve!

## Default `db.json`

```json
{
  "posts": [
    { "id": 1, "title": "json-server", "author": "typicode" }
  ],
  "comments": [
    { "id": 1, "body": "some comment", "postId": 1 }
  ],
  "profile": { "name": "typicode" }
}
```

## Geburtstags-Couverts & Grusskarten als PDF erzeugen

Dieses Repository enthält ausserdem ein Skript, das Geburtstagsadressen und -grüsse aus einem Google Sheet holt und druckfertige PDFs erzeugt:

* **C5-Couverts** (ein Umschlag pro Seite)
* **A4 Querformat** mit zwei Spalten (links Bibelvers, rechts wertschätzender Geburtstagsgruss)

### Voraussetzungen

1. Erstelle in der Google Cloud Console ein Service-Konto und lade den JSON-Schlüssel herunter.
2. Teile das Google Sheet mit der E-Mail-Adresse des Service-Kontos.
3. Hinterlege die Zugangsdaten als Umgebungsvariablen – z. B. in einer `.env` Datei:

   ```bash
   GOOGLE_SHEETS_ID=1abcdefgh1234567890    # ID aus der Google-Sheet-URL
   GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@projekt.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GOOGLE_SHEETS_RANGE=Geburtstage!A:H     # optional, Standard ist Sheet1!A:Z
   TIMEZONE=Europe/Zurich                  # optional
   OUTPUT_DIR=output                       # optional
   ```

4. Installiere die Abhängigkeiten (z. B. mit `pnpm install`).

### Spalten im Google Sheet

Die erste Zeile des Sheets muss Überschriften enthalten. Das Skript erkennt u. a. folgende Spaltennamen (Gross-/Kleinschreibung egal):

| Zweck                | Mögliche Überschriften (Beispiele)           |
| -------------------- | -------------------------------------------- |
| Name                 | `Name`, `Vorname Nachname`, `Fullname`       |
| Vorname / Nachname   | `Vorname`, `Nachname`                        |
| Geburtstag           | `Geburtstag`, `Geburtsdatum`, `Birthday`     |
| Adresse              | `Adresse`, `Adresszeile 1`, `Adresszeile 2`  |
| Strasse              | `Strasse`, `Straße`, `Street`                |
| PLZ                  | `PLZ`, `Postleitzahl`, `ZIP`                 |
| Ort                  | `Ort`, `Stadt`, `City`                       |
| Bibelvers            | `Bibelvers`, `Bibelstelle`, `Losung`         |
| Gruss                | `Gruss`, `Grusswort`, `Segenswunsch`, `Greeting` |

Für den Grusstext können die Platzhalter `{{name}}` oder `{{vorname}}` verwendet werden. Ist kein individueller Bibelvers oder Gruss hinterlegt, werden automatisch deutsche Standardtexte eingefügt.

### Skript ausführen

```bash
pnpm run generate-birthday-mailers
```

Die PDFs werden im Ordner `output/` (oder dem in `OUTPUT_DIR` gesetzten Pfad) abgelegt. Die Dateinamen enthalten das Datumsintervall der ausgewerteten Kalenderwoche.

Falls in der aktuellen Woche keine Geburtstage vorhanden sind, wird kein PDF erzeugt und eine entsprechende Meldung ausgegeben.

## Enable write operations

By default, only GET operation is allowed, thanks to the contribution by [@VicAv99](https://www.github.com/VicAv99) at [#6](https://github.com/kitloong/json-server-vercel/issues/6), we can now enable write operations as well.

You can find the example code in [`api/server.js`](./api/server.js).

## Reference

1. https://github.com/typicode/json-server
2. https://vercel.com
3. https://shadowsmith.com/how-to-deploy-an-express-api-to-vercel
