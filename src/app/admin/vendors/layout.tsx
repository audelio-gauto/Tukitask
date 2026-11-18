import VendorWorkspaceTabs from '../components/VendorWorkspaceTabs';

export default function VendorsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <VendorWorkspaceTabs />
      {children}
    </>
  );
}
