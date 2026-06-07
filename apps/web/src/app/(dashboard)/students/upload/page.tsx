'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Upload, CheckCircle, XCircle, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

const REQUIRED_FIELDS = ['parent_phone', 'fee_amount', 'due_date'] as const;
const ALL_FIELDS = ['case_id', 'student_name', 'parent_name', 'parent_phone', 'parent_email', 'fee_amount', 'fee_type', 'due_date', 'days_overdue', 'currency', 'payment_link', 'notes', 'language'] as const;

type FieldName = typeof ALL_FIELDS[number];

interface ParsedRow extends Record<string, string> {}
interface ValidationResult { valid: boolean; errors: string[]; }
interface UploadResult { inserted: number; skipped: number; errors: unknown[]; }

function validateRow(row: ParsedRow, mapping: Partial<Record<FieldName, string>>): ValidationResult {
  const errors: string[] = [];
  const phone = row[mapping.parent_phone ?? ''];
  if (!phone) errors.push('Missing parent phone');
  else if (!/^\+?[0-9]{10,13}$/.test(phone.replace(/\s/g, ''))) errors.push('Invalid phone format');
  const amount = row[mapping.fee_amount ?? ''];
  if (!amount || isNaN(Number(amount))) errors.push('Invalid fee amount');
  if (!row[mapping.due_date ?? '']) errors.push('Missing due date');
  return { valid: errors.length === 0, errors };
}

function mapRow(row: ParsedRow, mapping: Partial<Record<FieldName, string>>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [field, col] of Object.entries(mapping)) {
    if (col && row[col] !== undefined && row[col] !== '') result[field] = row[col];
  }
  if (result.fee_amount) result.fee_amount = parseFloat(result.fee_amount as string);
  if (result.days_overdue) result.days_overdue = parseInt(result.days_overdue as string);
  return result;
}

export default function BulkUploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldName, string>>>({});
  const [validations, setValidations] = useState<ValidationResult[]>([]);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<'upload' | 'map' | 'preview' | 'done'>('upload');
  const [result, setResult] = useState<UploadResult | null>(null);

  async function handleFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    let parsed: ParsedRow[] = [];
    if (ext === 'csv') {
      await new Promise<void>(res => Papa.parse(file, { header: true, skipEmptyLines: true, complete: r => { parsed = r.data as ParsedRow[]; res(); } }));
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf); const ws = wb.Sheets[wb.SheetNames[0]];
      parsed = XLSX.utils.sheet_to_json<ParsedRow>(ws, { defval: '' });
    } else { toast.error('Please upload a CSV or Excel file'); return; }
    if (parsed.length === 0) { toast.error('File is empty'); return; }
    setRows(parsed); setHeaders(Object.keys(parsed[0]));
    // Auto-map obvious columns
    const autoMap: Partial<Record<FieldName, string>> = {};
    for (const field of ALL_FIELDS) {
      const match = Object.keys(parsed[0]).find(h => h.toLowerCase().replace(/[^a-z]/g, '_') === field || h.toLowerCase() === field.replace(/_/g, ' '));
      if (match) autoMap[field] = match;
    }
    setMapping(autoMap);
    setStep('map');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function proceed() {
    const v = rows.map(r => validateRow(r, mapping));
    setValidations(v);
    setStep('preview');
  }

  async function upload() {
    const validRows = rows.filter((_, i) => validations[i]?.valid).map(r => mapRow(r, mapping));
    setUploading(true);
    try {
      const res = await api.post<UploadResult>('/v1/cases/bulk', { cases: validRows, dry_run: false });
      setResult(res);
      setStep('done');
      toast.success(`Uploaded ${res.inserted} cases`);
    } catch (e: unknown) { toast.error((e as Error).message || 'Upload failed'); }
    finally { setUploading(false); }
  }

  const validCount = validations.filter(v => v.valid).length;
  const invalidCount = validations.filter(v => !v.valid).length;

  if (step === 'done' && result) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-2xl font-bold">Upload Complete</h2>
        <p className="text-muted-foreground">{result.inserted} cases uploaded, {result.skipped} skipped</p>
        <Button onClick={() => router.push('/students')}>View Students</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bulk Upload</h1>
        <a href="/sample-upload.csv" download>
          <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-1" />Sample CSV</Button>
        </a>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 text-sm">
        {['upload', 'map', 'preview'].map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${step === s ? 'bg-primary text-white' : ['upload','map','preview'].indexOf(step) > i ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
            <span className="capitalize hidden sm:inline">{s}</span>
            {i < 2 && <span className="text-muted-foreground">→</span>}
          </span>
        ))}
      </div>

      {step === 'upload' && (
        <div
          className="border-2 border-dashed rounded-lg p-16 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onDrop={handleDrop} onDragOver={e => e.preventDefault()}
          onClick={() => inputRef.current?.click()}>
          <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="font-medium">Drop your CSV or Excel file here</p>
          <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{rows.length} rows detected. Map your columns to required fields.</p>
          <div className="grid grid-cols-2 gap-3">
            {ALL_FIELDS.map(field => (
              <div key={field} className="flex items-center gap-2">
                <label className="text-sm w-36 shrink-0">
                  {field.replace(/_/g, ' ')}
                  {REQUIRED_FIELDS.includes(field as typeof REQUIRED_FIELDS[number]) && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <Select value={mapping[field] ?? ''} onChange={e => setMapping(m => ({ ...m, [field]: e.target.value || undefined }))} className="flex-1">
                  <option value="">— skip —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </Select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
            <Button onClick={proceed} disabled={REQUIRED_FIELDS.some(f => !mapping[f])}>Preview</Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" />{validCount} valid</span>
            {invalidCount > 0 && <span className="flex items-center gap-1 text-red-600"><XCircle className="h-4 w-4" />{invalidCount} invalid (will be skipped)</span>}
          </div>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Phone</th>
                    <th className="px-3 py-2 text-left">Amount</th>
                    <th className="px-3 py-2 text-left">Due Date</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={`border-t ${validations[i]?.valid ? '' : 'bg-red-50'}`}>
                      <td className="px-3 py-1.5">{i + 1}</td>
                      <td className="px-3 py-1.5">{r[mapping.parent_phone ?? ''] ?? '—'}</td>
                      <td className="px-3 py-1.5">{r[mapping.fee_amount ?? ''] ? formatCurrency(Number(r[mapping.fee_amount ?? ''])) : '—'}</td>
                      <td className="px-3 py-1.5">{r[mapping.due_date ?? ''] ?? '—'}</td>
                      <td className="px-3 py-1.5">
                        {validations[i]?.valid ? <Badge className="bg-green-100 text-green-700">Valid</Badge>
                          : <span className="text-red-600 text-xs">{validations[i]?.errors.join(', ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('map')}>Back</Button>
            <Button onClick={upload} disabled={uploading || validCount === 0}>
              {uploading ? 'Uploading...' : `Upload ${validCount} rows`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
