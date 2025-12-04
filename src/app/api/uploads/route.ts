import { NextResponse } from 'next/server';
import path from 'path';
import { writeFile, mkdir } from 'fs/promises';

export const runtime = "nodejs";

const USE_SUPABASE = process.env.USE_SUPABASE === 'true';
const UPLOAD_FOLDER = path.join(process.cwd(), 'public', 'uploads');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });

    const filename = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    if (USE_SUPABASE) {
      // import และสร้าง client เฉพาะตอนใช้
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      );
      const { data, error } = await supabase.storage
        .from('uploads')
        .upload(filename, buffer, { contentType: file.type });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const { data: urlData } = supabase.storage
        .from('uploads')
        .getPublicUrl(filename);
      return NextResponse.json({ url: urlData.publicUrl });
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