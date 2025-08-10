import express from 'express';
import multer from 'multer';
import { google } from 'googleapis';
import { Readable } from 'node:stream';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

async function getDrive() {
  const creds = JSON.parse(process.env.SA_JSON);
  const jwt = new google.auth.JWT(
    creds.client_email, null, creds.private_key,
    ['https://www.googleapis.com/auth/drive.file']
  );
  await jwt.authorize();
  return google.drive({ version: 'v3', auth: jwt });
}

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { lawyerId, lawyerName, type } = req.body;
    const drive = await getDrive();
    const parent = process.env.ADMIN_FOLDER_ID;

    // find or create per-lawyer folder under parent
    const folderName = (lawyerName || lawyerId || 'unknown').trim();
    const search = await drive.files.list({
      q: `'${parent}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    const folderId = search.data.files?.[0]?.id ||
      (await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parent]
        },
        fields: 'id',
        supportsAllDrives: true
      })).data.id;

    // Convert buffer to stream for upload
    const stream = Readable.from(req.file.buffer);
    const { data: file } = await drive.files.create({
      requestBody: { name: req.file.originalname, parents: [folderId] },
      media: { mimeType: req.file.mimetype, body: stream },
      fields: 'id',
      supportsAllDrives: true
    });

    res.json({ fileId: file.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'upload_failed', message: e.message });
  }
});

app.get('/', (_, res) => res.send('ok'));
app.listen(process.env.PORT || 8080);
