import Image from "next/image";
import logo_adidas from "../../../../public/affiliate-poc-logos/adidas.png";
import logo_cj from "../../../../public/affiliate-poc-logos/cj.png";
import logo_drax from "../../../../public/affiliate-poc-logos/drax.png";
import logo_gatorade from "../../../../public/affiliate-poc-logos/gatorade.png";
import logo_gwangjin from "../../../../public/affiliate-poc-logos/gwangjin.png";
import logo_hyemin_hospital from "../../../../public/affiliate-poc-logos/hyemin-hospital.png";
import logo_inbody from "../../../../public/affiliate-poc-logos/inbody.png";
import logo_kaleg from "../../../../public/affiliate-poc-logos/kaleg.png";
import logo_kto from "../../../../public/affiliate-poc-logos/kto.png";
import logo_lg from "../../../../public/affiliate-poc-logos/lg.png";
import logo_lingtea from "../../../../public/affiliate-poc-logos/lingtea.png";
import logo_lotte from "../../../../public/affiliate-poc-logos/lotte.png";
import logo_mapmyrun from "../../../../public/affiliate-poc-logos/mapmyrun.png";
import logo_mizuno from "../../../../public/affiliate-poc-logos/mizuno.png";
import logo_newbalance from "../../../../public/affiliate-poc-logos/newbalance.png";
import logo_powerade from "../../../../public/affiliate-poc-logos/powerade.png";
import logo_redbull from "../../../../public/affiliate-poc-logos/redbull.png";
import logo_salomon from "../../../../public/affiliate-poc-logos/salomon.png";
import logo_samyangroundhill from "../../../../public/affiliate-poc-logos/samyangroundhill.png";
import logo_seoul from "../../../../public/affiliate-poc-logos/seoul.png";
import logo_shinsegae from "../../../../public/affiliate-poc-logos/shinsegae.png";
import logo_strig from "../../../../public/affiliate-poc-logos/strig.png";
import logo_walkerhill from "../../../../public/affiliate-poc-logos/walkerhill.png";
const logos = [
  logo_seoul,
  logo_gwangjin,
  logo_adidas,
  logo_lg,
  logo_newbalance,
  logo_gatorade,
  logo_powerade,
  logo_cj,
  logo_drax,
  logo_hyemin_hospital,
  logo_inbody,
  logo_kaleg,
  logo_kto,
  logo_lingtea,
  logo_lotte,
  logo_mapmyrun,
  logo_mizuno,
  logo_redbull,
  logo_salomon,
  logo_samyangroundhill,
  logo_shinsegae,
  logo_strig,
  logo_walkerhill,
];
export function Logos() {
  return (
    <div className="flex flex-wrap gap-10 p-8 rounded justify-center items-center dark:bg-white">
      {logos.map((src, i) => (
        <Image key={i} src={src} alt="adidas" height={40} />
      ))}
    </div>
  );
}
