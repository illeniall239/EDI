import Navigation from '@/components/Navigation';

export default function Projects() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-8 text-gray-800">
          My Projects
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Project Cards will be dynamically populated here */}
          <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <h3 className="text-xl font-semibold mb-2">Sample Analysis</h3>
            <p className="text-gray-600 mb-4">
              Analysis of customer satisfaction data using EDI.ai
            </p>
            <div className="text-sm text-gray-500">
              Created: 2024-03-20
            </div>
          </div>
        </div>
      </main>
    </div>
  );
} 