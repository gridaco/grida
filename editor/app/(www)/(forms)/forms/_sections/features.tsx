import {
  AccountTreeIcon,
  ApiIcon,
  DashBoardCustomizeIcon,
  SmartToyIcon,
  AnalysisIcon,
  VisualStudioIcon,
} from "@/www/icons";

export default function Features() {
  return (
    <div>
      <h2 className="text-4xl font-semibold text-center py-20 max-w-lg mx-auto">
        Elevate User Experience with Tailored Interactivity{" "}
      </h2>
      <div className="mt-20">
        <div className="columns-2 lg:columns-3 2xl:columns-3 grid-rows-2 space-y-20">
          <FeatureCard
            icon={<SmartToyIcon size={24} />}
            title={"Smart Customer Identity"}
            excerpt={
              "Optimize user experience with customizable Smart Customer Identity in your forms."
            }
          />
          <FeatureCard
            icon={<AccountTreeIcon size={24} />}
            title={"Connect Customer Identity"}
            excerpt={
              "Align your forms with your customers' identity, fostering a personalized and trustworthy interaction."
            }
          />
          <FeatureCard
            icon={<VisualStudioIcon size={24} />}
            title={"Visual Editor"}
            excerpt={
              "Visual Editor allows users to intuitively customize visuals, ensuring their forms match their unique style."
            }
          />
          <FeatureCard
            icon={<AnalysisIcon size={24} />}
            title={"Advanced Analytics"}
            excerpt={
              "Advanced Analytics provides detailed insights to optimize your form strategy."
            }
          />
          <FeatureCard
            icon={<DashBoardCustomizeIcon size={24} />}
            title={"Custom branding & form"}
            excerpt={
              "Customize your form pages with branding elements to align seamlessly with your brand identity."
            }
          />
          <FeatureCard
            icon={<ApiIcon size={24} />}
            title={"API access"}
            excerpt={
              "API access allows for streamlined integration and enhanced form functionality."
            }
          />
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  title,
  excerpt,
  icon,
}: {
  title: string;
  excerpt: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex justify-center">
      <div className="flex-col gap-7">
        {icon}
        <div className="flex flex-col gap-1 mt-4 max-w-64">
          <span className="text-md font-medium">{title}</span>
          <p className=" text-sm font-normal opacity-50">{excerpt}</p>
        </div>
      </div>
    </div>
  );
}
