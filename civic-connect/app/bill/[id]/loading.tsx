import SummaryLoading from "@/components/SummaryLoading";

export default function BillLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-card shadow-card p-8 space-y-4">
            <div className="flex gap-2">
              <div className="h-5 w-20 bg-gray-100 rounded-full animate-pulse" />
              <div className="h-5 w-24 bg-gray-100 rounded-full animate-pulse" />
            </div>
            <div className="h-8 bg-gray-200 rounded animate-pulse" />
            <div className="h-8 bg-gray-200 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 bg-gray-100 rounded animate-pulse w-5/6" />
            <div className="mt-4">
              <SummaryLoading />
            </div>
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="bg-white rounded-card shadow-card p-6 space-y-4">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 bg-gray-100 rounded animate-pulse w-4/5" />
            <div className="h-10 bg-gray-200 rounded-full animate-pulse mt-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
