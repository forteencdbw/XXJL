// 员工：角色生成与站位、按工作顺序派活、成长、雇佣/辞退/工资。
import { playSfx } from "../audio";
import { JOBS, JOB_NAMES, STAT_NAMES, getHireCost, getStaffCap, getStaffWage, getTotalStars, recordWork } from "../logic";
import type { Employee, Job } from "../logic";
import { Character } from "./Character";
import { COOK_HOME, COOK_PRIORITY_MS, HAWKER_HOME, SERVER_HOME } from "./constants";
import type { TavernScene } from "./TavernScene";

export class StaffMethods {
  firstJob(this: TavernScene, e: Employee): Job | null {
    return e.jobs.find((j) => j.on)?.job ?? null;
  }

  /** 空闲站位：第一优先工作的区域，同区多人依次错开。 */
  staffHome(this: TavernScene, e: Employee): { x: number; y: number } {
    const job = this.firstJob(e);
    const base = job === "seat" ? SERVER_HOME : job === "cook" ? COOK_HOME : HAWKER_HOME;
    const sameArea = this.employees.filter((o) => this.firstJob(o) === job);
    return { x: base.x + Math.max(0, sameArea.indexOf(e)) * 26, y: base.y };
  }

  /** 按当前名单重建员工角色；只在打烊时调用（营业中名单锁定）。 */
  rebuildStaffChars(this: TavernScene) {
    this.staffRt.forEach((rt) => rt.char.destroy());
    this.staffRt.clear();
    for (const e of this.employees) {
      const job = this.firstJob(e);
      const look = job === "seat" ? "server" : job === "cook" ? "cook" : "hawker";
      const color = look === "server" ? 0x3a7a5a : look === "cook" ? 0x7a4a3a : 0x8a6a3a;
      const home = this.staffHome(e);
      const char = new Character(this, home.x, home.y, color, 0x2b2b2b, false, look);
      char.displayName = e.name;
      char.setVisible(false);
      this.staffRt.set(e.id, { char, seat: null, cookingBooth: null });
    }
  }

  staffChars(this: TavernScene): Character[] {
    return [...this.staffRt.values()].map((rt) => rt.char);
  }

  employeeById(this: TavernScene, id: number | null): Employee | undefined {
    return id === null ? undefined : this.employees.find((e) => e.id === id);
  }

  /** 记一次工作，涨星时写进见闻录。 */
  staffDidWork(this: TavernScene, e: Employee, job: Job) {
    if (recordWork(e, job)) this.log(`${e.name}${JOB_NAMES[job]}熟了手，${STAT_NAMES[job]}升到 ${e.stars[job]} 星`);
  }

  /** 空闲员工按自己的工作顺序，从上往下取第一件能做的事。采买只在打烊时做。 */
  assignStaffWork(this: TavernScene, time: number) {
    for (const e of this.employees) {
      const rt = this.staffRt.get(e.id);
      if (!rt || rt.seat || rt.cookingBooth !== null) continue;
      for (const { job, on } of e.jobs) {
        if (!on) continue;
        if (job === "seat" && this.startSeat("staff", e)) break;
        if (job === "cook" && this.staffTryCook(e, time)) break;
      }
    }
  }

  staffTryCook(this: TavernScene, e: Employee, time: number): boolean {
    const menu = this.getMenuDishes();
    const next = menu.length ? menu[this.dishCursor % menu.length] : null;
    // 先确认轮到的菜能在打烊前做完；做不完就直接不接，避免每帧空转
    if (!next || !this.canFinishBeforeClose(next, "staff", e)) return false;
    const index = this.booths.findIndex(
      (booth) => booth.state === "awaitingCook" && booth.floor === this.activeFloor && time - booth.awaitingSince >= COOK_PRIORITY_MS,
    );
    return index !== -1 && this.startCook(this.booths[index], index, "staff", undefined, e);
  }

  /** 勾了采买的员工里精明最高的那位，决定采购折扣；没人勾为 null。 */
  bestBuyer(this: TavernScene): Employee | null {
    const buyers = this.employees.filter((e) => e.jobs.some((j) => j.job === "buy" && j.on));
    return buyers.reduce<Employee | null>((best, e) => (!best || e.stars.buy > best.stars.buy ? e : best), null);
  }

  /** 一句话说明当前分工：每项工作有几人在做，没人做的环节要玩家补位。 */
  staffSummaryHint(this: TavernScene): string {
    const count = (job: Job) => this.employees.filter((e) => e.jobs.some((j) => j.job === job && j.on)).length;
    const parts = JOBS.map((job) => `${JOB_NAMES[job]} ${count(job)} 人`).join(" · ");
    const missing = (["seat", "cook"] as const).filter((job) => count(job) === 0).map((job) => JOB_NAMES[job]);
    return missing.length ? `${parts}（${missing.join("、")}没人做，需你亲自动手）` : parts;
  }

  hireStaff(this: TavernScene, c: Employee) {
    const cap = getStaffCap(this.level);
    const cost = getHireCost(c);
    if (this.employees.length >= cap) {
      this.staffNotice = `人手已满（${cap} 人），扩建酒楼可多雇`;
      this.staffNoticeGood = false;
      return;
    }
    // 负余额下不能雇人，必须现金充足
    if (this.coins < cost) {
      this.staffNotice = `灵石不足，雇${c.name}需 ${cost} 灵石`;
      this.staffNoticeGood = false;
      return;
    }
    this.coins -= cost;
    this.displayedCoins = this.coins;
    this.candidates = this.candidates.filter((o) => o !== c);
    this.employees.push(c);
    this.rebuildStaffChars();
    this.save();
    this.staffNotice = `已雇${c.name}（${cost} 灵石）`;
    this.staffNoticeGood = true;
    playSfx("upgrade");
    this.log(`雇到${c.name}，去伙计页安排分工`);
  }

  /** 打烊时辞退：当天不付工资，也不给遣散费。 */
  fireStaff(this: TavernScene, e: Employee) {
    this.employees = this.employees.filter((o) => o !== e);
    this.pendingFireId = null;
    this.rebuildStaffChars();
    this.save();
    this.staffNotice = `${e.name}已离店`;
    this.staffNoticeGood = true;
    this.log(`辞退了${e.name}`);
  }

  /** 按当前属性结算当日工资；可以扣成负数，负数表示欠款。 */
  settleWages(this: TavernScene): { name: string; stars: number; wage: number }[] {
    const details = this.employees.map((e) => ({ name: e.name, stars: getTotalStars(e), wage: getStaffWage(e) }));
    const total = details.reduce((sum, d) => sum + d.wage, 0);
    this.coins -= total;
    this.displayedCoins = this.coins;
    return details;
  }
}
