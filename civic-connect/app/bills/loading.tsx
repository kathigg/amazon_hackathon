export default function BillsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="h-10 w-48 bg-gray-200 rounded-xl animate-pulse mb-2" />
      <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-10" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-white rounded-card shadow-card p-6 flex flex-col gap-4">
            <div className="flex gap-2">
              <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
              <div className="h-5 w-24 bg-gray-100 rounded-full animate-pulse ml-auto" />
            </div>
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-4/5" />
            <div className="h-3 bg-gray-100 rounded animate-pulse" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
