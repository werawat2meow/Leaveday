import { NextResponse } from 'next/server';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';
import crypto from 'crypto';

export const runtime = "nodejs";

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';
const UPLOAD_FOLDER = path.join(process.cwd(), 'public', 'uploads');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const origName = file.name || 'file';
    const ext = path.extname(origName) || '';
    const base = path.basename(origName, ext).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '');
    const unique = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const filename = `${base ? base + '-' : ''}${unique}${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (USE_SUPABASE) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );

      // Try upload with upsert; if not supported/fails, try remove+upload
      try {
        const { error } = await supabase.storage
          .from('uploads')
          .upload(filename, buffer, { contentType: file.type, upsert: true } as any);
        if (error) throw error;
      } catch (err) {
        // fallback: attempt to remove existing then upload
        try {
          await supabase.storage.from('uploads').remove([filename]).catch(() => {});
          const { error: err2 } = await supabase.storage
            .from('uploads')
            .upload(filename, buffer, { contentType: file.type } as any);
          if (err2) throw err2;
        } catch (uploadErr: any) {
          console.error('[UPLOAD SUPABASE] upload failed', uploadErr);
          return NextResponse.json({ error: uploadErr?.message ?? 'upload failed' }, { status: 500 });
        }
      }

      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filename);
      return NextResponse.json({ url: urlData?.publicUrl ?? '' });
    } else {
      await mkdir(UPLOAD_FOLDER, { recursive: true });
      await writeFile(path.join(UPLOAD_FOLDER, filename), buffer);
      const url = `/uploads/${filename}`;
      return NextResponse.json({ url });
    }
  } catch (e) {
    console.error('Upload error:', e);
    return NextResponse.json({ error: 'upload failed' }, { status: 500 });
  }
}