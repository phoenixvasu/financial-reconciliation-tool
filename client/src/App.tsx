import { useState } from 'react'
import axios from 'axios'
import FileUpload from './components/FileUpload'
import './App.css'
import { CheckCircleIcon, ExclamationCircleIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'

interface ReconcileResult {
  matched: any[]
  unmatchedA: any[]
  unmatchedB: any[]
  [key: string]: any
}

const apiUrl = import.meta.env.PROD ? '/api/reconcile' : (import.meta.env.VITE_API_URL || '/api/reconcile');

function App() {
  const [result, setResult] = useState<ReconcileResult | null>(null)
  const [rawJson, setRawJson] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [tab, setTab] = useState<'matched' | 'unmatchedA' | 'unmatchedB' | 'review' | 'llmCandidates'>('matched')
  const [showRaw, setShowRaw] = useState(false)
  const [reviewed, setReviewed] = useState<{ [key: number]: 'confirmed' | 'rejected' | undefined }>({})

  const handleSubmit = async ({ fileA, fileB }: { fileA: File; fileB: File }) => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    setResult(null)
    setRawJson(null)
    try {
      if (!apiUrl) {
        throw new Error('API URL is not set. Please check your .env configuration.');
      }
      const formData = new FormData()
      formData.append('fileA', fileA)
      formData.append('fileB', fileB)
      const response = await axios.post(apiUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setRawJson(response.data)
      setResult({
        matched: response.data.matches || [],
        unmatchedA: response.data.unmatched_file_a_entries || [],
        unmatchedB: response.data.unmatched_file_b_entries || [],
        ...response.data,
      })
      setSuccess('Reconciliation complete!')
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'API request failed.')
    } finally {
      setLoading(false)
    }
  }

  // Metadata extraction helper
  const getMeta = () => {
    if (!result) return null
    return [
      { label: 'Matched Transactions', value: result.matched?.length ?? 0, icon: <CheckCircleIcon className="w-5 h-5 text-green-500 inline-block mr-1" /> },
      { label: 'Unmatched in File A', value: result.unmatchedA?.length ?? 0, icon: <ExclamationCircleIcon className="w-5 h-5 text-yellow-500 inline-block mr-1" /> },
      { label: 'Unmatched in File B', value: result.unmatchedB?.length ?? 0, icon: <ExclamationCircleIcon className="w-5 h-5 text-yellow-500 inline-block mr-1" /> },
    ]
  }

  const renderTable = (rows: any[], type: 'matched' | 'unmatchedA' | 'unmatchedB') => {
    if (!rows || rows.length === 0) {
      return <div className="text-gray-500 text-center py-8">No records found.</div>
    }
    if (type === 'matched') {
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded shadow text-xs md:text-sm">
            <thead>
              <tr>
                <th className="px-2 py-2 border-b">File A</th>
                <th className="px-2 py-2 border-b">File B</th>
                <th className="px-2 py-2 border-b">Confidence</th>
                <th className="px-2 py-2 border-b">Reason</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-blue-50">
                  <td className="px-2 py-2 border-b align-top whitespace-pre-wrap">
                    {row.file_a_entry ? (
                      <pre className="bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">{JSON.stringify(row.file_a_entry, null, 2)}</pre>
                    ) : row.file_a_entries ? (
                      row.file_a_entries.map((entry: any, idx: number) => (
                        <pre key={idx} className="bg-gray-50 rounded p-2 mb-1 text-xs whitespace-pre-wrap">{JSON.stringify(entry, null, 2)}</pre>
                      ))
                    ) : null}
                  </td>
                  <td className="px-2 py-2 border-b align-top whitespace-pre-wrap">
                    {row.file_b_entry ? (
                      <pre className="bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">{JSON.stringify(row.file_b_entry, null, 2)}</pre>
                    ) : row.file_b_entries ? (
                      row.file_b_entries.map((entry: any, idx: number) => (
                        <pre key={idx} className="bg-gray-50 rounded p-2 mb-1 text-xs whitespace-pre-wrap">{JSON.stringify(entry, null, 2)}</pre>
                      ))
                    ) : null}
                  </td>
                  <td className="px-2 py-2 border-b align-top text-center font-bold">
                    {row.confidence_score != null ? (
                      <span className={
                        row.confidence_score >= 0.95 ? 'text-green-600' : row.confidence_score >= 0.85 ? 'text-yellow-600' : 'text-red-600'
                      }>
                        {row.confidence_score}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-2 py-2 border-b align-top text-xs">{row.match_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    } else {
      // unmatchedA or unmatchedB
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white rounded shadow text-xs md:text-sm">
            <thead>
              <tr>
                <th className="px-2 py-2 border-b">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-yellow-50">
                  <td className="px-2 py-2 border-b align-top whitespace-pre-wrap">
                    <pre className="bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">{JSON.stringify(row, null, 2)}</pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
  }

  const handleReview = (idx: number, action: 'confirmed' | 'rejected') => {
    setReviewed(prev => ({ ...prev, [idx]: action }));
  };

  const renderReviewTable = (rows: any[]) => {
    if (!rows || rows.length === 0) {
      return <div className="text-gray-500 text-center py-8">No records to review.</div>;
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded shadow text-xs md:text-sm">
          <thead>
            <tr>
              <th className="px-2 py-2 border-b">File A</th>
              <th className="px-2 py-2 border-b">File B</th>
              <th className="px-2 py-2 border-b">Confidence</th>
              <th className="px-2 py-2 border-b">Reason</th>
              <th className="px-2 py-2 border-b">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-blue-50">
                <td className="px-2 py-2 border-b align-top whitespace-pre-wrap">
                  {row.file_a_entry ? (
                    <pre className="bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">{JSON.stringify(row.file_a_entry, null, 2)}</pre>
                  ) : row.file_a_entries ? (
                    row.file_a_entries.map((entry: any, idx: number) => (
                      <pre key={idx} className="bg-gray-50 rounded p-2 mb-1 text-xs whitespace-pre-wrap">{JSON.stringify(entry, null, 2)}</pre>
                    ))
                  ) : null}
                </td>
                <td className="px-2 py-2 border-b align-top whitespace-pre-wrap">
                  {row.file_b_entry ? (
                    <pre className="bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">{JSON.stringify(row.file_b_entry, null, 2)}</pre>
                  ) : row.file_b_entries ? (
                    row.file_b_entries.map((entry: any, idx: number) => (
                      <pre key={idx} className="bg-gray-50 rounded p-2 mb-1 text-xs whitespace-pre-wrap">{JSON.stringify(entry, null, 2)}</pre>
                    ))
                  ) : null}
                </td>
                <td className="px-2 py-2 border-b align-top text-center font-bold">
                  {row.confidence_score != null ? (
                    <span className={
                      row.confidence_score >= 0.95 ? 'text-green-600' : row.confidence_score >= 0.85 ? 'text-yellow-600' : 'text-red-600'
                    }>
                      {row.confidence_score}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-2 py-2 border-b align-top text-xs">{row.match_reason}</td>
                <td className="px-2 py-2 border-b align-top text-center">
                  {reviewed[i] === 'confirmed' && <span className="text-green-600 font-bold">Confirmed</span>}
                  {reviewed[i] === 'rejected' && <span className="text-red-600 font-bold">Rejected</span>}
                  {!reviewed[i] && (
                    <div className="flex gap-2 justify-center">
                      <button className="bg-green-100 hover:bg-green-200 text-green-800 px-2 py-1 rounded text-xs font-semibold" onClick={() => handleReview(i, 'confirmed')}>Confirm</button>
                      <button className="bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded text-xs font-semibold" onClick={() => handleReview(i, 'rejected')}>Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderLLMCandidatesTable = (rows: any[]) => {
    if (!rows || rows.length === 0) {
      return <div className="text-gray-500 text-center py-8">No LLM candidate pairs found.</div>;
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded shadow text-xs md:text-sm">
          <thead>
            <tr>
              <th className="px-2 py-2 border-b">FileA Index</th>
              <th className="px-2 py-2 border-b">FileB Index</th>
              <th className="px-2 py-2 border-b">File A</th>
              <th className="px-2 py-2 border-b">File B</th>
              <th className="px-2 py-2 border-b">Confidence</th>
              <th className="px-2 py-2 border-b">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-blue-50">
                <td className="px-2 py-2 border-b align-top text-center">{row.file_a_index}</td>
                <td className="px-2 py-2 border-b align-top text-center">{row.file_b_index}</td>
                <td className="px-2 py-2 border-b align-top whitespace-pre-wrap">
                  <pre className="bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">{JSON.stringify(row.file_a_entry, null, 2)}</pre>
                </td>
                <td className="px-2 py-2 border-b align-top whitespace-pre-wrap">
                  <pre className="bg-gray-50 rounded p-2 text-xs whitespace-pre-wrap">{JSON.stringify(row.file_b_entry, null, 2)}</pre>
                </td>
                <td className="px-2 py-2 border-b align-top text-center font-bold">
                  {row.confidence_score != null ? (
                    <span className={
                      row.confidence_score >= 0.95 ? 'text-green-600' : row.confidence_score >= 0.85 ? 'text-yellow-600' : 'text-red-600'
                    }>
                      {row.confidence_score}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-2 py-2 border-b align-top text-xs">{row.match_reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 py-10 px-2">
      <h1 className="text-4xl font-extrabold text-center mb-8 text-blue-800 drop-shadow">Financial Reconciliation Tool</h1>
      <div className="max-w-3xl mx-auto">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 text-center">
            {success}
          </div>
        )}
        <FileUpload onSubmit={handleSubmit} loading={loading} />
        {loading && (
          <div className="flex justify-center mt-6">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
          </div>
        )}
        {result && (
          <div className="mt-10">
            <div className="mb-6 flex flex-wrap gap-4 justify-center">
              {getMeta()?.map(meta => (
                <div key={meta.label} className="flex items-center gap-2 bg-white shadow px-5 py-3 rounded-lg text-blue-900 text-base font-semibold">
                  {meta.icon}
                  {meta.label}: <span className="font-bold text-blue-700 text-lg">{meta.value}</span>
                </div>
              ))}
      </div>
            <div className="mb-6 flex justify-center gap-2">
              <button
                className={`px-4 py-2 rounded-t-lg font-semibold border-b-2 transition-all duration-150 ${tab === 'matched' ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-blue-700 border-transparent hover:bg-blue-100'}`}
                onClick={() => setTab('matched')}
              >
                Matched
              </button>
              <button
                className={`px-4 py-2 rounded-t-lg font-semibold border-b-2 transition-all duration-150 ${tab === 'unmatchedA' ? 'bg-yellow-400 text-yellow-900 border-yellow-600' : 'bg-white text-yellow-700 border-transparent hover:bg-yellow-100'}`}
                onClick={() => setTab('unmatchedA')}
              >
                Unmatched in File A
              </button>
              <button
                className={`px-4 py-2 rounded-t-lg font-semibold border-b-2 transition-all duration-150 ${tab === 'unmatchedB' ? 'bg-yellow-400 text-yellow-900 border-yellow-600' : 'bg-white text-yellow-700 border-transparent hover:bg-yellow-100'}`}
                onClick={() => setTab('unmatchedB')}
              >
                Unmatched in File B
              </button>
              <button
                className={`px-4 py-2 rounded-t-lg font-semibold border-b-2 transition-all duration-150 ${tab === 'review' ? 'bg-gray-400 text-gray-900 border-gray-600' : 'bg-white text-gray-700 border-transparent hover:bg-gray-100'}`}
                onClick={() => setTab('review')}
              >
                Review
              </button>
              <button
                className={`px-4 py-2 rounded-t-lg font-semibold border-b-2 transition-all duration-150 ${tab === 'llmCandidates' ? 'bg-purple-600 text-white border-purple-700' : 'bg-white text-purple-700 border-transparent hover:bg-purple-100'}`}
                onClick={() => setTab('llmCandidates')}
              >
                All LLM Candidates
              </button>
              <button
                className="ml-4 px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold flex items-center gap-1"
                onClick={() => setShowRaw(v => !v)}
              >
                <DocumentDuplicateIcon className="w-5 h-5 inline-block" /> Raw JSON
        </button>
            </div>
            <div className="bg-white rounded-b-lg shadow-lg p-4">
              {tab === 'matched' && renderTable(result.matched, 'matched')}
              {tab === 'unmatchedA' && renderTable(result.unmatchedA, 'unmatchedA')}
              {tab === 'unmatchedB' && renderTable(result.unmatchedB, 'unmatchedB')}
              {tab === 'review' && renderReviewTable(result.matched)}
              {tab === 'llmCandidates' && renderLLMCandidatesTable(result.llm_candidates)}
            </div>
            {showRaw && (
              <div className="mt-8">
                <h2 className="text-xl font-semibold mb-2">Raw JSON Response</h2>
                <div className="bg-gray-900 text-green-200 rounded p-4 overflow-x-auto max-h-96">
                  <pre className="whitespace-pre-wrap break-all text-xs md:text-sm">{JSON.stringify(rawJson, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
