// index.js
import express from 'express';
import multer from 'multer';
import { google } from 'googleapis';
import { Readable } from 'node:stream';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// Build a Drive client using OAuth2 refresh token (admin Gmail)
function getDrive() {
  const oauth2 = new google.auth.OAuth2(
    process.env.CLIENT_ID,       // Web client ID
    process.env.CLIENT_SECRET    // Web client secret
  );
  oauth2.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth: oauth2 });
}

app.get('/', (_, res) => res.send('ok'));

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { lawyerId, lawyerName } = req.body;
    const parent = process.env.ADMIN_FOLDER_ID;
    if (!req.file || !parent) return res.status(400).json({ error: 'missing_file_or_parent' });

    const drive = getDrive();

    // Find or create per-lawyer subfolder under admin folder
    const folderName = (lawyerName || lawyerId || 'unknown').trim();
    const search = await drive.files.list({
      q: `'${parent}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const folderId =
      search.data.files?.[0]?.id ||
      (
        await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parent]
          },
          fields: 'id',
          supportsAllDrives: true
        })
      ).data.id;

    // Upload the file (buffer -> stream)
    const stream = Readable.from(req.file.buffer);
    const created = await drive.files.create({
      requestBody: { name: req.file.originalname, parents: [folderId] },
      media: { mimeType: req.file.mimetype, body: stream },
      fields: 'id',
      supportsAllDrives: true
    });

    res.json({ fileId: created.data.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'upload_failed', message: e.message });
  }
});

app.listen(process.env.PORT || 8080);
