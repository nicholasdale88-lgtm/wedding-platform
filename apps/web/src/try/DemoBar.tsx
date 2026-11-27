/**
 * Try the app: along the bottom, what this is (a sample, nothing saved), back to the front page, and start your
 * own wedding. One plan, so there's no plan to pick here any more.
 * `beside`: on a computer it starts beside the side menu, so it never covers Help at the menu's foot.
 */
export function DemoBar({ beside = false }: { beside?: boolean }) {
  return (
    <div role="region" aria-label="Sample wedding" className={`fixed z-[25] ${beside ? 'left-[236px]' : 'left-0'} right-0 bottom-0 px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] bg-[#2a1c26] text-[#f3ecd6] shadow-[0_-8px_24px_rgba(0,0,0,.2)] print:hidden`}>
      <div className="max-w-[1100px] mx-auto flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-2 text-[13px]">
        <a href="/" aria-label="Back to The Yes List" className="inline-flex items-center min-h-[44px] min-w-[44px] justify-center py-[6px] px-3 rounded-full border border-[rgba(243,236,214,.35)] no-underline !text-[#f3ecd6]">
          ←<span className="hidden sm:inline"> The Yes List</span>
        </a>
        <span className="hidden sm:inline">
          <strong>A sample wedding.</strong> Try anything: nothing is saved or sent.
        </span>
        <strong className="sm:hidden text-[12px] font-semibold">Sample, nothing is sent</strong>
        <a href="/#start" className="ml-auto inline-flex items-center min-h-[44px] py-[7px] px-3 sm:px-4 rounded-full no-underline font-semibold whitespace-nowrap !text-[#2a1c26] bg-[#d6b780]">
          Start&nbsp;<span className="hidden sm:inline">your wedding</span>
          <span className="sm:hidden">yours</span>
        </a>
      </div>
    </div>
  );
}
