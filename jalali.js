/* تبدیل تاریخ شمسی/میلادی؛ ریاضی خالص بدون کتابخانه. هم اپ و هم تست‌ها از همین استفاده می‌کنند. */
(function (root) {
const PERSIAN_MONTHS=["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
function gregorianToJalali(gy,gm,gd){
  const g_d_m=[0,31,59,90,120,151,181,212,243,273,304,334];
  const gy2=(gm>2)?(gy+1):gy;
  let days=355666+(365*gy)+(Math.floor((gy2+3)/4))-(Math.floor((gy2+99)/100))+(Math.floor((gy2+399)/400))+gd+g_d_m[gm-1];
  let jy=-1595+(33*Math.floor(days/12053));
  days%=12053;
  jy+=4*Math.floor(days/1461);
  days%=1461;
  if(days>365){ jy+=Math.floor((days-1)/365); days=(days-1)%365; }
  const jm=(days<186)?1+Math.floor(days/31):7+Math.floor((days-186)/30);
  const jd=1+((days<186)?(days%31):((days-186)%30));
  return [jy,jm,jd];
}
function jalaliToGregorian(jy,jm,jd){
  jy+=1595;
  let days=-355668+(365*jy)+(Math.floor(jy/33)*8)+Math.floor(((jy%33)+3)/4)+jd+(jm<7?(jm-1)*31:((jm-7)*30)+186);
  let gy=400*Math.floor(days/146097);
  days%=146097;
  if(days>36524){ gy+=100*Math.floor(--days/36524); days%=36524; if(days>=365) days++; }
  gy+=4*Math.floor(days/1461);
  days%=1461;
  if(days>365){ gy+=Math.floor((days-1)/365); days=(days-1)%365; }
  let gd=days+1;
  const isLeap=y=>(y%4===0&&y%100!==0)||(y%400===0);
  const sal_a=[0,31,isLeap(gy)?29:28,31,30,31,30,31,31,30,31,30,31];
  let gm; for(gm=1;gm<=12;gm++){ const v=sal_a[gm]; if(gd<=v) break; gd-=v; }
  return [gy,gm,gd];
}
function jalaliMonthLength(jy,jm){
  let njy=jy,njm=jm+1; if(njm>12){njm=1;njy++}
  const [gy,gm,gd]=jalaliToGregorian(njy,njm,1);
  const d=new Date(gy,gm-1,gd); d.setDate(d.getDate()-1);
  return gregorianToJalali(d.getFullYear(),d.getMonth()+1,d.getDate())[2];
}
function todayJalali(){ const d=new Date(); return gregorianToJalali(d.getFullYear(),d.getMonth()+1,d.getDate()); }
  const api = { PERSIAN_MONTHS, gregorianToJalali, jalaliToGregorian, jalaliMonthLength, todayJalali };
  root.JAL = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
