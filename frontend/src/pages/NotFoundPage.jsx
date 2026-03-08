import { Link } from 'react-router-dom';
import { Home, ArrowLeft, Car, MapPin } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* Animated illustration */}
        <div className="relative mb-8">
          <div className="text-[150px] font-bold text-primary/10 select-none">404</div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative">
              <Car className="w-24 h-24 text-primary animate-bounce" />
              <MapPin className="w-8 h-8 text-red-500 absolute -top-4 -right-4 animate-pulse" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Route Not Found
        </h1>
        <p className="text-gray-600 mb-8">
          Looks like this cab took a wrong turn! The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/"
            className="btn-primary flex items-center justify-center gap-2"
          >
            <Home className="w-4 h-4" />
            Go to Dashboard
          </Link>
          <button
            onClick={() => window.history.back()}
            className="btn-secondary flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>

        <p className="mt-8 text-sm text-gray-500">
          Need help? Contact your system administrator.
        </p>
      </div>
    </div>
  );
}
