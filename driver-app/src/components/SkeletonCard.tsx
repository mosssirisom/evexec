export default function SkeletonCard() {
  return (
    <div className="bg-[#0B1525] border border-white/8 rounded-2xl overflow-hidden animate-pulse">
      <div className="flex items-center justify-between px-4 pt-4 pb-3.5 border-b border-white/6">
        <div className="h-4 bg-white/8 rounded-lg w-24" />
        <div className="h-7 bg-white/8 rounded-lg w-14" />
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 bg-white/8 rounded-full w-16" />
          <div className="h-6 bg-white/8 rounded-lg w-12" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 bg-white/8 rounded-lg w-3/4" />
        </div>
        <div className="flex gap-3">
          <div className="h-3 bg-white/8 rounded-lg w-12" />
          <div className="h-3 bg-white/8 rounded-lg w-16" />
        </div>
        <div className="pt-2.5 border-t border-white/5">
          <div className="h-3 bg-white/8 rounded-lg w-28" />
        </div>
      </div>
    </div>
  );
}
