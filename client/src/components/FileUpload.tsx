import React, { useRef, useState } from 'react';

export interface FileUploadProps {
  onSubmit: (files: { fileA: File; fileB: File }) => void;
  loading: boolean;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onSubmit, loading, disabled }) => {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileAInput = useRef<HTMLInputElement>(null);
  const fileBInput = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setFile: (f: File | null) => void) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileA || !fileB) {
      setError('Please select both files.');
      return;
    }
    setError(null);
    onSubmit({ fileA, fileB });
  };

  const resetFiles = () => {
    setFileA(null);
    setFileB(null);
    if (fileAInput.current) fileAInput.current.value = '';
    if (fileBInput.current) fileBInput.current.value = '';
    setError(null);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md w-full max-w-xl mx-auto flex flex-col gap-4">
      <div>
        <label className="block font-medium mb-1">File A (CSV or Excel)</label>
        <input
          type="file"
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          onChange={e => handleFileChange(e, setFileA)}
          ref={fileAInput}
          className="block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          disabled={loading || disabled}
        />
        {fileA && <span className="text-xs text-gray-500">{fileA.name}</span>}
      </div>
      <div>
        <label className="block font-medium mb-1">File B (CSV or Excel)</label>
        <input
          type="file"
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          onChange={e => handleFileChange(e, setFileB)}
          ref={fileBInput}
          className="block w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          disabled={loading || disabled}
        />
        {fileB && <span className="text-xs text-gray-500">{fileB.name}</span>}
      </div>
      {error && <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm">{error}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed flex-1"
          disabled={!fileA || !fileB || loading || disabled}
        >
          {loading ? 'Reconciling...' : 'Submit'}
        </button>
        <button
          type="button"
          className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold px-4 py-2 rounded flex-1"
          onClick={resetFiles}
          disabled={loading || disabled}
        >
          Reset
        </button>
      </div>
    </form>
  );
};

export default FileUpload;
