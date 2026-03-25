import Sidebar from "@/components/Sidebar";
import MobileSidebar from "@/components/MobileSidebar";
import { WhiteLabelProvider } from "@/components/WhiteLabelProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WhiteLabelProvider>
      <TooltipProvider>
        <div className="flex min-h-screen">
          {/* Desktop sidebar */}
          <div className="hidden lg:block">
            <Sidebar />
          </div>

          {/* Mobile sidebar */}
          <MobileSidebar />

          <main className="flex-1 overflow-auto">
            <div className="max-w-7xl mx-auto p-4 pt-16 lg:p-6 lg:pt-6 lg:pl-8">
              {children}
            </div>
          </main>
        </div>
      </TooltipProvider>
    </WhiteLabelProvider>
  );
}
