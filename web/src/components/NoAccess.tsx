import { Link } from 'react-router-dom'

export default function NoAccess({ what = 'this page' }: { what?: string }) {
  return (
    <div className="p-6 max-w-md mx-auto text-center text-slate-600">
      <h1 className="text-lg font-semibold text-slate-900 mb-2">No access</h1>
      <p className="text-sm">You don't have access to {what}. Ask a board member if you think you should.</p>
      <Link to="/app" className="inline-block mt-4 text-sm text-blue-600 hover:underline">
        Back to home
      </Link>
    </div>
  )
}
