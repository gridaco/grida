import Image from "next/image";
import { brands } from "@/www/data/brands";

const logos = [
  brands.seoul,
  brands.gwangjin,
  brands.adidas,
  brands.lg,
  brands.newBalance,
  brands.gatorade,
  brands.powerade,
  brands.cj,
  brands.drax,
  brands.hyeminHospital,
  brands.inbody,
  brands.kaleg,
  brands.kto,
  brands.lingtea,
  brands.lotte,
  brands.mapmyrun,
  brands.mizuno,
  brands.redBull,
  brands.salomon,
  brands.samyangRoundhill,
  brands.shinsegae,
  brands.strig,
  brands.walkerhill,
];

export function Logos() {
  return (
    <div className="flex flex-wrap gap-10 p-8 rounded-sm justify-center items-center">
      {logos.map(({ name, logo }) => (
        <Image
          key={name}
          src={logo}
          alt={name}
          height={40}
          className="p-1 rounded-sm grayscale dark:invert hover:grayscale-0 hover:dark:invert-0 hover:bg-white"
        />
      ))}
    </div>
  );
}
