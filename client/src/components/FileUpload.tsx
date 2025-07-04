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
  const [progress, setProgress] = useState<number>(0);
  const fileAInput = useRef<HTMLInputElement>(null);
  const fileBInput = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setFile: (f: File | null) => void) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      // File type/size validation (e.g., max 5MB)
      const allowedTypes = [
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ];
      if (!allowedTypes.includes(file.type)) {
        setError('Invalid file type. Please upload a CSV or Excel file.');
        setFile(null);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('File too large (max 5MB).');
        setFile(null);
        return;
      }
      setFile(file);
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
    setProgress(0);
    // Simulate progress for UX (real progress handled in parent via loading)
    let prog = 0;
    const interval = setInterval(() => {
      prog += 10;
      setProgress(Math.min(prog, 90));
      if (prog >= 90) clearInterval(interval);
    }, 100);
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
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-md w-full max-w-xl mx-auto flex flex-col gap-4">
      <div>
        <label className="block font-medium mb-1 text-gray-800 dark:text-gray-200">File A (CSV or Excel)</label>
        <input
          type="file"
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          onChange={e => handleFileChange(e, setFileA)}
          ref={fileAInput}
          className="block w-full border border-gray-300 dark:border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-gray-100"
          disabled={loading || disabled}
          aria-label="Upload File A"
        />
        {fileA && <span className="text-xs text-gray-500 dark:text-gray-300">{fileA.name}</span>}
      </div>
      <div>
        <label className="block font-medium mb-1 text-gray-800 dark:text-gray-200">File B (CSV or Excel)</label>
        <input
          type="file"
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          onChange={e => handleFileChange(e, setFileB)}
          ref={fileBInput}
          className="block w-full border border-gray-300 dark:border-gray-700 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-800 dark:text-gray-100"
          disabled={loading || disabled}
          aria-label="Upload File B"
        />
        {fileB && <span className="text-xs text-gray-500 dark:text-gray-300">{fileB.name}</span>}
      </div>
      {error && <div className="bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 px-3 py-2 rounded text-sm">{error}</div>}
      {loading && (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
          <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed flex-1"
          disabled={!fileA || !fileB || loading || disabled}
          aria-disabled={loading || disabled}
        >
          {loading ? 'Reconciling...' : 'Submit'}
        </button>
        <button
          type="button"
          className="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold px-4 py-2 rounded flex-1"
          onClick={resetFiles}
          disabled={loading || disabled}
          aria-disabled={loading || disabled}
        >
          Reset
        </button>
      </div>
    </form>
  );
};

export default FileUpload;
