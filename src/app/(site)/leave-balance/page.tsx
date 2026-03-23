import LeaveBalancePageClient from "@/components/leave-balance/LeaveBalancePageClient";

type SearchParams = {
	employeeId?: string;
	year?: string;
	org?: string;
	department?: string;
	division?: string;
	unit?: string;
	q?: string;
	source?: string;
};

type PageProps = {
	searchParams?: SearchParams;
};

function normalize(value?: string) {
	return value?.trim() || "";
}

export default function LeaveBalancePage({ searchParams }: PageProps) {
	return (
		<LeaveBalancePageClient
			initialEmployeeId={normalize(searchParams?.employeeId)}
			initialYear={normalize(searchParams?.year) || String(new Date().getFullYear())}
			initialFilters={{
				org: normalize(searchParams?.org),
				department: normalize(searchParams?.department),
				division: normalize(searchParams?.division),
				unit: normalize(searchParams?.unit),
				q: normalize(searchParams?.q),
			}}
			source={normalize(searchParams?.source)}
		/>
	);
}
