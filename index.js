import express from 'express';
import multer from 'multer';
import { google } from 'googleapis';

const app = express();
const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });

async function getDrive() {
  const creds = JSON.parse(process.env.SA_JSON);
  const jwt = new google.auth.JWT(
    creds.client_email, null, creds.private_key,
    ['https://www.googleapis.com/auth/drive.file']
  );
  await jwt.authorize();
  return google.drive({ version: 'v3', auth: jwt });
}

app.get('/', (_, res) => res.send('ok'));

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { lawyerId, lawyerName, type } = req.body;
    const drive = await getDrive();
    const parent = process.env.ADMIN_FOLDER_ID;

    const folderName = (lawyerName || lawyerId || 'unknown').trim();
    const search = await drive.files.list({
      q: `'${parent}' in parents and name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)', pageSize: 1
    });
    const folderId = search.data.files?.[0]?.id || (await drive.files.create({
      requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parent] },
      fields: 'id'
    })).data.id;

    const media = { mimeType: req.file.mimetype, body: Buffer.from(req.file.buffer) };
    const file = await drive.files.create({
      requestBody: { name: req.file.originalname, parents: [folderId] },
      media, fields: 'id'
    });

    res.json({ fileId: file.data.id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'upload_failed' });
  }
});

app.listen(process.env.PORT || 8080);
