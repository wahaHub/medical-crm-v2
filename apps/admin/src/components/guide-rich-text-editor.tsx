'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Redo2, RemoveFormatting, Underline, Undo2,
} from 'lucide-react';
import { type GuideContentDocument, withGuideImagePreviews } from '@/lib/guides';
import { uploadFileWithProgress } from '@/lib/upload-file';

interface UploadInitResponse {
  upload?: { uploadUrl: string; storageKey: string };
  asset?: { storageKey: string };
  error?: string;
  message?: string;
}

const GuideImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      storageKey: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-storage-key'),
        renderHTML: (attributes) => attributes.storageKey ? { 'data-storage-key': attributes.storageKey } : {},
      },
    };
  },
});

export function GuideRichTextEditor({
  document,
  imageUrls,
  onChange,
}: {
  document: GuideContentDocument;
  imageUrls: Record<string, string>;
  onChange: (document: GuideContentDocument) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const serializedDocument = useMemo(() => JSON.stringify(withGuideImagePreviews(document, imageUrls)), [document, imageUrls]);
  const appliedDocumentRef = useRef('');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      GuideImage.configure({ allowBase64: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Write the guide body. Use the toolbar for headings, lists, links, quotes, and images.' }),
    ],
    content: JSON.parse(serializedDocument),
    editorProps: {
      attributes: { class: 'guide-rich-content focus:outline-none' },
    },
    onUpdate: ({ editor: activeEditor }) => {
      const next = activeEditor.getJSON() as GuideContentDocument;
      appliedDocumentRef.current = JSON.stringify(next);
      onChange(next);
    },
  });

  useEffect(() => {
    if (!editor || serializedDocument === appliedDocumentRef.current) return;
    editor.commands.setContent(JSON.parse(serializedDocument), { emitUpdate: false });
    appliedDocumentRef.current = serializedDocument;
  }, [editor, serializedDocument]);

  async function uploadImage(file?: File) {
    if (!file) return;
    setError(null);
    setIsUploading(true);
    setUploadProgress(0);
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG, or WebP image.');
      const initResponse = await fetch('/api/guides/images/upload-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type, kind: 'content' }),
      });
      const init = await initResponse.json() as UploadInitResponse;
      if (!initResponse.ok || !init.upload || !init.asset) throw new Error(init.error ?? init.message ?? 'Unable to initialize image upload');
      setUploadProgress(8);
      await uploadFileWithProgress(init.upload.uploadUrl, file, setUploadProgress);
      editor?.chain().focus().insertContent({
        type: 'image',
        attrs: { src: URL.createObjectURL(file), storageKey: init.asset.storageKey, alt: '', title: '' },
      }).run();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to upload image');
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2">
      <ToolbarButton editor={editor} label="Heading 2" active={editor?.isActive('heading', { level: 2 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Heading 3" active={editor?.isActive('heading', { level: 3 })} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Underline" active={editor?.isActive('underline')} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Bulleted list" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Numbered list" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Quote" active={editor?.isActive('blockquote')} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Add link" onClick={() => setLink(editor)}><Link2 size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Upload image" disabled={isUploading} onClick={() => fileInputRef.current?.click()}><ImagePlus size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Clear formatting" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={16} /></ToolbarButton>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <ToolbarButton editor={editor} label="Undo" onClick={() => editor?.chain().focus().undo().run()}><Undo2 size={16} /></ToolbarButton>
      <ToolbarButton editor={editor} label="Redo" onClick={() => editor?.chain().focus().redo().run()}><Redo2 size={16} /></ToolbarButton>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void uploadImage(event.target.files?.[0])} />
    </div>
    {uploadProgress !== null && <div className="border-b border-cyan-100 bg-cyan-50 px-4 py-3" aria-live="polite"><div className="mb-1.5 flex items-center justify-between text-xs font-medium text-cyan-900"><span>Uploading article image</span><span>{uploadProgress}%</span></div><div role="progressbar" aria-label="Article image upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress} className="h-2 overflow-hidden rounded-full bg-cyan-100"><div className="h-full rounded-full bg-cyan-700 transition-[width] duration-150" style={{ width: `${uploadProgress}%` }} /></div></div>}
    {error && <p className="border-b border-rose-100 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>}
    <EditorContent editor={editor} />
  </div>;
}

function setLink(editor: Editor | null) {
  if (!editor) return;
  const previousUrl = editor.getAttributes('link').href as string | undefined;
  const url = window.prompt('Link URL', previousUrl ?? 'https://');
  if (url === null) return;
  if (!url.trim()) { editor.chain().focus().unsetLink().run(); return; }
  if (!/^(https?:|mailto:)/i.test(url.trim())) return;
  editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
}

function ToolbarButton({ editor, label, active, disabled, onClick, children }: {
  editor: Editor | null;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <button type="button" title={label} aria-label={label} disabled={!editor || disabled} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-sm text-slate-600 hover:bg-white hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-white text-cyan-700 shadow-sm' : ''}`}>{children}</button>;
}
