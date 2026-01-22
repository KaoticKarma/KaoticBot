import { useAuth } from './AuthContext';

export default function Login() {
  const { login, loading, error } = useAuth();

  return (
    <div className="min-h-screen bg-[#0e0e10] flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            Kaotic<span className="text-[#53fc18]">Bot</span>
          </h1>
          <p className="text-gray-400">
            The ultimate chat bot for Kick streamers
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[#18181b] rounded-xl p-8 shadow-2xl border border-[#2f2f35]">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">
            Welcome Back
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            onClick={login}
            disabled={loading}
            className="w-full bg-[#53fc18] hover:bg-[#45d614] text-black font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              <>
                {/* Kick Logo SVG */}
                <svg
                  className="w-6 h-6"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                Connect with Kick
              </>
            )}
          </button>

          <p className="mt-6 text-center text-gray-500 text-sm">
            By connecting, you agree to our{' '}
            <a href="#" className="text-[#53fc18] hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="text-[#53fc18] hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>

        {/* Features Preview */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="p-4">
            <div className="text-2xl mb-2">⚡</div>
            <p className="text-gray-400 text-sm">Custom Commands</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">🎯</div>
            <p className="text-gray-400 text-sm">Stream Alerts</p>
          </div>
          <div className="p-4">
            <div className="text-2xl mb-2">🛡️</div>
            <p className="text-gray-400 text-sm">Moderation</p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-gray-600 text-xs">
          © 2025 KaoticBot. Not affiliated with Kick.
        </p>
      </div>
    </div>
  );
}
