import type React from "react";

// Props for icon components
type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

// Create a single-path icon component
function icon(d: string, viewBox = "0 0 24 24") {
	return function Icon({ size = 16, ...props }: IconProps) {
		return (
			<svg
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				width={size}
				height={size}
				viewBox={viewBox}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.75}
				strokeLinecap="round"
				strokeLinejoin="round"
				{...props}
			>
				<path d={d} />
			</svg>
		);
	};
}

// Create a multi-path icon component
function iconMulti(paths: string[], viewBox = "0 0 24 24") {
	return function Icon({ size = 16, ...props }: IconProps) {
		return (
			<svg
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				width={size}
				height={size}
				viewBox={viewBox}
				fill="none"
				stroke="currentColor"
				strokeWidth={1.75}
				strokeLinecap="round"
				strokeLinejoin="round"
				{...props}
			>
				{paths.map((d) => (
					<path key={d} d={d} />
				))}
			</svg>
		);
	};
}

export const IconSparkles = iconMulti([
	"M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z",
	"M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z",
]);

export const IconTerminal = iconMulti(["M4 17l6-6-6-6", "M12 19h8"]);

export const IconX = icon("M18 6L6 18M6 6l12 12");

export const IconPlus = icon("M12 5v14M5 12h14");

export const IconCheck = icon("M20 6L9 17l-5-5");

export const IconChevronRight = icon("M9 18l6-6-6-6");
export const IconChevronDown = icon("M6 9l6 6 6-6");

export const IconTrash = iconMulti([
	"M3 6h18",
	"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
]);

export const IconPlay = icon("M5 3l14 9-14 9V3z");

export const IconPause = iconMulti(["M6 4h4v16H6z", "M14 4h4v16H14z"]);

export const IconHammer = iconMulti([
	"M15.12 7.88c1.17-1.17 1.17-3.07 0-4.24L13 5.76",
	"M8.88 15.12l-4.24 4.24a1.5 1.5 0 0 0 2.12 2.12l4.24-4.24",
	"M17.5 10.5L10.5 17.5",
	"M14 7l3 3",
]);

export const IconTarget = iconMulti([
	"M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z",
	"M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 6z",
	"M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
]);

export const IconPalette = iconMulti([
	"M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.5 0-.39-.15-.74-.38-1.02-.22-.27-.35-.62-.35-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.52-4.48-9.5-10-9.5z",
]);

export const IconLayout = iconMulti(["M3 3h18v18H3z", "M3 9h18", "M9 21V9"]);
export const IconLayoutGrid = iconMulti([
	"M3 3h7v7H3z",
	"M14 3h7v7h-7z",
	"M3 14h7v7H3z",
	"M14 14h7v7h-7z",
]);

export const IconLayoutRows = iconMulti([
	"M3 3h5v18H3z",
	"M10 3h5v18h-5z",
	"M17 3h5v18h-5z",
]);

export const IconFolder = icon(
	"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
);

export const IconFolderOpen = iconMulti([
	"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1",
	"M5 21l3-9h16l-3 9",
]);

export function IconGitBranch({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<line x1="6" y1="3" x2="6" y2="15" />
			<circle cx="18" cy="6" r="3" />
			<circle cx="6" cy="18" r="3" />
			<path d="M18 9a9 9 0 0 1-9 9" />
		</svg>
	);
}

export function IconCamera({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
			<circle cx="12" cy="13" r="4" />
		</svg>
	);
}

export function IconEye({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

export const IconPencil = iconMulti([
	"M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z",
]);

export function IconSearch({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<circle cx="11" cy="11" r="8" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</svg>
	);
}

export const IconGlobe = iconMulti([
	"M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z",
	"M2 12h20",
	"M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
]);

export const IconWrench = iconMulti([
	"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
]);

export const IconAlertTriangle = iconMulti([
	"M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
	"M12 9v4",
	"M12 17h.01",
]);

export const IconCode = iconMulti(["M16 18l6-6-6-6", "M8 6l-6 6 6 6"]);

export const IconRobot = iconMulti([
	"M12 2a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1v4a2 2 0 0 1-2 2v2h-1v-2h-2v2h-1v-2H8a2 2 0 0 1-2-2v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3V4a2 2 0 0 1 2-2z",
	"M9 10h.01",
	"M15 10h.01",
]);

export const IconSlash = iconMulti([
	"M3.5 5h17a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-17a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z",
	"M8 10l3 2-3 2",
	"M14 14h3",
]);

export const IconLayers = iconMulti([
	"M12 2 2 7l10 5 10-5-10-5z",
	"M2 12l10 5 10-5",
	"M2 17l10 5 10-5",
]);

export function IconGitCommit({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<circle cx="12" cy="12" r="4" />
			<line x1="1.05" y1="12" x2="7" y2="12" />
			<line x1="17.01" y1="12" x2="22.96" y2="12" />
		</svg>
	);
}

export const IconFilePlus = iconMulti([
	"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
	"M14 2v6h6",
	"M12 18v-6",
	"M9 15h6",
]);

export const IconUsers = iconMulti([
	"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2",
	"M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
	"M23 21v-2a4 4 0 0 0-3-3.87",
	"M16 3.13a4 4 0 0 1 0 7.75",
]);

export const IconList = iconMulti([
	"M8 6h13",
	"M8 12h13",
	"M8 18h13",
	"M3 6h.01",
	"M3 12h.01",
	"M3 18h.01",
]);

export const IconClock = iconMulti([
	"M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z",
	"M12 6v6l4 2",
]);

export const IconMessageSquare = iconMulti([
	"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
]);

export const IconFileSearch = iconMulti([
	"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
	"M14 2v6h6",
	"M12 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
]);

export const IconBookmark = iconMulti([
	"M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
]);

export const IconCopy = iconMulti([
	"M9 9h13v13H9z",
	"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
]);

export const IconSend = iconMulti(
	["M22 2 11 13", "M22 2 15 22 11 13 2 9 22 2"],
	"0 0 24 24"
);

export const IconHelpCircle = iconMulti([
	"M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z",
	"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3",
	"M12 17h.01",
]);

export const IconArrowDown = iconMulti(["M12 2v20", "M5 15l7 7 7-7"]);

export const IconTag = iconMulti(["M2 12l10 10 10-10-10-10H2z", "M7 7h.01"]);

export const IconCloud = iconMulti([
	"M7 18h10a4 4 0 0 0 0-8 5 5 0 0 0-9.7-1.5A3.5 3.5 0 0 0 7 18z",
]);

export function IconStop({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			{...props}
		>
			<rect x="6" y="6" width="12" height="12" rx="1" />
		</svg>
	);
}

export function IconFolderFill({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="currentColor"
			{...props}
		>
			<path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6z" />
		</svg>
	);
}

export function IconAnthropic({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 1200 1200"
			fill="#d97757"
			{...props}
		>
			<path d="M 233.959793 800.214905 L 468.644287 668.536987 L 472.590637 657.100647 L 468.644287 650.738403 L 457.208069 650.738403 L 417.986633 648.322144 L 283.892639 644.69812 L 167.597321 639.865845 L 54.926208 633.825623 L 26.577238 627.785339 L 3.3e-05 592.751709 L 2.73832 575.27533 L 26.577238 559.248352 L 60.724873 562.228149 L 136.187973 567.382629 L 249.422867 575.194763 L 331.570496 580.026978 L 453.261841 592.671082 L 472.590637 592.671082 L 475.328857 584.859009 L 468.724915 580.026978 L 463.570557 575.194763 L 346.389313 495.785217 L 219.543671 411.865906 L 153.100723 363.543762 L 117.181267 339.060425 L 99.060455 316.107361 L 91.248367 266.01355 L 123.865784 230.093994 L 167.677887 233.073853 L 178.872513 236.053772 L 223.248367 270.201477 L 318.040283 343.570496 L 441.825592 434.738342 L 459.946411 449.798706 L 467.194672 444.64447 L 468.080597 441.020203 L 459.946411 427.409485 L 392.617493 305.718323 L 320.778564 181.932983 L 288.80542 130.630859 L 280.348999 99.865845 C 277.369171 87.221436 275.194641 76.590698 275.194641 63.624268 L 312.322174 13.20813 L 332.8591 6.604126 L 382.389313 13.20813 L 403.248352 31.328979 L 434.013519 101.71814 L 483.865753 212.537048 L 561.181274 363.221497 L 583.812134 407.919434 L 595.892639 449.315491 L 600.40271 461.959839 L 608.214783 461.959839 L 608.214783 454.711609 L 614.577271 369.825623 L 626.335632 265.61084 L 637.771851 131.516846 L 641.718201 93.745117 L 660.402832 48.483276 L 697.530334 24.000122 L 726.52356 37.852417 L 750.362549 72 L 747.060486 94.067139 L 732.886047 186.201416 L 705.100708 330.52356 L 686.979919 427.167847 L 697.530334 427.167847 L 709.61084 415.087341 L 758.496704 350.174561 L 840.644348 247.490051 L 876.885925 206.738342 L 919.167847 161.71814 L 946.308838 140.29541 L 997.61084 140.29541 L 1035.38269 196.429626 L 1018.469849 254.416199 L 965.637634 321.422852 L 921.825562 378.201538 L 859.006714 462.765259 L 819.785278 530.41626 L 823.409424 535.812073 L 832.75177 534.92627 L 974.657776 504.724915 L 1051.328979 490.872559 L 1142.818848 475.167786 L 1184.214844 494.496582 L 1188.724854 514.147644 L 1172.456421 554.335693 L 1074.604126 578.496765 L 959.838989 601.449829 L 788.939636 641.879272 L 786.845764 643.409485 L 789.261841 646.389343 L 866.255127 653.637634 L 899.194702 655.409424 L 979.812134 655.409424 L 1129.932861 666.604187 L 1169.154419 692.537109 L 1192.671265 724.268677 L 1188.724854 748.429688 L 1128.322144 779.194641 L 1046.818848 759.865845 L 856.590759 714.604126 L 791.355774 698.335754 L 782.335693 698.335754 L 782.335693 703.731567 L 836.69812 756.885986 L 936.322205 846.845581 L 1061.073975 962.81897 L 1067.436279 991.490112 L 1051.409424 1014.120911 L 1034.496704 1011.704712 L 924.885986 929.234924 L 882.604126 892.107544 L 786.845764 811.48999 L 780.483276 811.48999 L 780.483276 819.946289 L 802.550415 852.241699 L 919.087341 1027.409424 L 925.127625 1081.127686 L 916.671204 1098.604126 L 886.469849 1109.154419 L 853.288696 1103.114136 L 785.073914 1007.355835 L 714.684631 899.516785 L 657.906067 802.872498 L 650.979858 806.81897 L 617.476624 1167.704834 L 601.771851 1186.147705 L 565.530212 1200 L 535.328857 1177.046997 L 519.302124 1139.919556 L 535.328857 1066.550537 L 554.657776 970.792053 L 570.362488 894.68457 L 584.536926 800.134277 L 592.993347 768.724976 L 592.429626 766.630859 L 585.503479 767.516968 L 514.22821 865.369263 L 405.825531 1011.865906 L 320.053711 1103.677979 L 299.516815 1111.812256 L 263.919525 1093.369263 L 267.221497 1060.429688 L 287.114136 1031.114136 L 405.825531 880.107361 L 477.422913 786.52356 L 523.651062 732.483276 L 523.328918 724.671265 L 520.590698 724.671265 L 205.288605 929.395935 L 149.154434 936.644409 L 124.993355 914.01355 L 127.973183 876.885986 L 139.409409 864.80542 L 234.201385 799.570435 L 233.879227 799.8927 Z" />
		</svg>
	);
}

export function IconOpenAI({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="#ffffff"
			{...props}
		>
			<path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
		</svg>
	);
}

export function CommitGraphLinesLayer({
	width,
	height,
	className,
	style,
	railSegments,
	transitions,
	colX,
	rowTop,
	rowBottom,
	buildConnection,
	lineWidth,
}: {
	width: number;
	height: number;
	className?: string;
	style?: React.CSSProperties;
	railSegments: Array<{
		key: string;
		row: number;
		column: number;
		color: string;
	}>;
	transitions: Array<{
		row: number;
		fromCol: number;
		toCol: number;
		color: string;
	}>;
	colX: (column: number) => number;
	rowTop: (row: number) => number;
	rowBottom: (row: number) => number;
	buildConnection: (transition: {
		row: number;
		fromCol: number;
		toCol: number;
		color: string;
	}) => string;
	lineWidth: number;
}) {
	return (
		<svg
			aria-hidden="true"
			overflow="hidden"
			className={className}
			width={width}
			height={height}
			style={style}
		>
			{railSegments.map((segment) => {
				const x = colX(segment.column);
				return (
					<line
						key={segment.key}
						x1={x}
						y1={rowTop(segment.row)}
						x2={x}
						y2={rowBottom(segment.row)}
						stroke={segment.color}
						strokeWidth={lineWidth}
						strokeOpacity={0.98}
						strokeLinecap="round"
					/>
				);
			})}
			{transitions.map((transition, i) => (
				<path
					key={i}
					d={buildConnection(transition)}
					stroke={transition.color}
					strokeWidth={lineWidth}
					strokeOpacity={0.9}
					strokeLinecap="round"
					fill="none"
				/>
			))}
		</svg>
	);
}

export function ProjectGraphConnectionsLayer({
	nodes,
	hoveredNodeId,
	selectedNodeId,
	className,
}: {
	nodes: ReadonlyArray<{
		id: string;
		x: number;
		y: number;
		connections: readonly string[];
	}>;
	hoveredNodeId: string | null;
	selectedNodeId: string | null;
	className?: string;
}) {
	return (
		<svg aria-hidden="true" className={className}>
			{nodes.flatMap((node) =>
				node.connections.map((targetId) => {
					const target = nodes.find((item) => item.id === targetId);
					if (!target) return null;
					const active =
						hoveredNodeId === node.id ||
						hoveredNodeId === targetId ||
						selectedNodeId === node.id ||
						selectedNodeId === targetId;
					return (
						<line
							key={`${node.id}-${targetId}`}
							x1={node.x + 56}
							y1={node.y + 16}
							x2={target.x + 56}
							y2={target.y + 16}
							stroke={
								active ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.1)"
							}
							strokeDasharray={active ? "none" : "4 4"}
							strokeWidth={active ? 1.5 : 1}
						/>
					);
				})
			)}
		</svg>
	);
}

export const IconPanelLeft = iconMulti([
	"M3 3h18a0 0 0 0 1 0 0v18a0 0 0 0 1 0 0H3a0 0 0 0 1 0 0V3z",
	"M9 3v18",
]);

// Panel right icon for collapsing right sidebar
export const IconPanelRight = iconMulti(["M3 3h18v18H3V3z", "M15 3v18"]);

export const IconExternalLink = iconMulti([
	"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
	"M15 3h6v6",
	"M10 14L21 3",
]);

export const IconArrowLeft = icon("M19 12H5M12 19l-7-7 7-7");

export const IconMessageCircle = iconMulti([
	"M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z",
]);

export function IconUser({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
			<circle cx="12" cy="7" r="4" />
		</svg>
	);
}

export function IconSettings({ size = 16, ...props }: IconProps) {
	return (
		<svg
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.75}
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
			<circle cx="12" cy="12" r="3" />
		</svg>
	);
}

export const IconZap = icon("M13 2L3 14h7l-1 8 10-12h-7l1-8z");

export const IconLogOut = iconMulti([
	"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",
	"M16 17l5-5-5-5",
	"M21 12H9",
]);

export const IconExpand = iconMulti([
	"M15 3h6v6",
	"M21 3l-7 7",
	"M9 21H3v-6",
	"M3 21l7-7",
]);

export const IconCollapse = iconMulti([
	"M10 14H4v6",
	"M4 20l7-7",
	"M14 10h6V4",
	"M20 4l-7 7",
]);

export const IconCircle = icon(
	"M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z"
);
export const IconLoader = iconMulti([
	"M12 2v4",
	"M12 18v4",
	"M4.93 4.93l2.83 2.83",
	"M16.24 16.24l2.83 2.83",
	"M2 12h4",
	"M18 12h4",
	"M4.93 19.07l2.83-2.83",
	"M16.24 7.76l2.83-2.83",
]);

// Zen mode icon - auto-follow file changes (eye with sparkle)
export const IconZen = iconMulti([
	"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z",
	"M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
	"M17 2l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2",
]);

export type { IconProps };
