import { useState } from 'react'
import axios from 'axios'
import FileUpload from './components/FileUpload'
import './App.css'

interface ReconcileResult {
  matched: any[]
  unmatchedA: any[]
  unmatchedB: any[]
  [key: string]: any
}

function App() {
  const [result, setResult] = useState<ReconcileResult | null>(null)
  const [rawJson, setRawJson] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async ({ fileA, fileB }: { fileA: File; fileB: File }) => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    setResult(null)
    setRawJson(null)
    try {
      const formData = new FormData()
      formData.append('fileA', fileA)
      formData.append('fileB', fileB)
      const response = await axios.post('/reconcile', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setRawJson(response.data)
      setResult({
        matched: response.data.matched_transactions || [],
        unmatchedA: response.data.unmatched_transactions_fileA || [],
        unmatchedB: response.data.unmatched_transactions_fileB || [],
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
      { label: 'Matched Transactions', value: result.matched?.length ?? 0 },
      { label: 'Unmatched in File A', value: result.unmatchedA?.length ?? 0 },
      { label: 'Unmatched in File B', value: result.unmatchedB?.length ?? 0 },
    ]
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-2">
      <h1 className="text-3xl font-bold text-center mb-8 text-blue-700">Financial Reconciliation Tool</h1>
      <div className="max-w-2xl mx-auto">
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
          <div className="mt-8">
            <div className="mb-4 flex flex-wrap gap-4 justify-center">
              {getMeta()?.map(meta => (
                <div key={meta.label} className="bg-blue-100 text-blue-800 px-4 py-2 rounded shadow text-sm font-medium">
                  {meta.label}: <span className="font-bold">{meta.value}</span>
                </div>
              ))}
            </div>
            <h2 className="text-xl font-semibold mb-2">Raw JSON Response</h2>
            <div className="bg-gray-900 text-green-200 rounded p-4 overflow-x-auto max-h-96">
              <pre className="whitespace-pre-wrap break-all text-xs md:text-sm">{JSON.stringify(rawJson, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
