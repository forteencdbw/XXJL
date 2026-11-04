// 员工（含掌柜）：角色生成与站位、按工作顺序派活、成长、雇佣/辞退/工资。
import { playSfx } from "../audio";
import { JOBS, JOB_NAMES, SHOPKEEPER_ID, gainExp, getEffectiveStars, getHireCost, getStaffCap, getStaffWage, getTotalStars } from "../logic";
import type { Employee, Job } from "../logic";
import { Character } from "./Character";
import { COOK_HOME, HAWKER_HOME, NIGHT_SEAT, NIGHT_STAFF_SEATS, SERVER_HOME } from "./constants";
import type { TavernScene } from "./TavernScene";

export class StaffMethods {
  /** 店里干活的全部人手：掌柜排第一，后面是雇来的伙计。 */
  workforce(this: TavernScene): Employee[] {
    return [this.shopkeeper, ...this.employees];
  }

  firstJob(this: TavernScene, e: Employee): Job | null {
    return e.jobs.find((j) => j.on)?.job ?? null;
  }

  /** 空闲站位：第一优先工作的区域，同区多人依次错开。 */
  staffHome(this: TavernScene, e: Employee): { x: number; y: number } {
    const job = this.firstJob(e);
    const base = job === "seat" ? SERVER_HOME : job === "cook" ? COOK_HOME : HAWKER_HOME;
    const sameArea = this.workforce().filter((o) => this.firstJob(o) === job);
    return { x: base.x + Math.max(0, sameArea.indexOf(e)) * 26, y: base.y };
  }

  /** 按当前名单重建伙计角色（掌柜用玩家角色）；只在打烊时调用（营业中名单锁定）。 */
  rebuildStaffChars(this: TavernScene) {
    this.staffRt.forEach((rt, id) => {
      if (id !== SHOPKEEPER_ID) rt.char.destroy();
    });
    this.staffRt.clear();
    this.staffRt.set(SHOPKEEPER_ID, { char: this.playerChar, task: null, floor: 0 });
    for (const e of this.employees) {
      const job = this.firstJob(e);
      const look = job === "seat" ? "server" : job === "cook" ? "cook" : "hawker";
      const color = look === "server" ? 0x3a7a5a : look === "cook" ? 0x7a4a3a : 0x8a6a3a;
      const home = this.staffHome(e);
      const char = new Character(this, home.x, home.y, color, 0x2b2b2b, false, look);
      char.displayName = e.name;
      char.setVisible(false);
      this.staffRt.set(e.id, { char, task: null, floor: 0 });
    }
    const home = this.staffHome(this.shopkeeper);
    this.playerChar.teleportTo(home.x, home.y);
    // 夜里雇人/辞退后，新名单直接到法坛打坐
    if (this.gameState !== "open") this.seatForNight();
  }

  /** 夜修：掌柜坐在法坛正中，伙计在身后排成一两排，都盘腿吐息。 */
  seatForNight(this: TavernScene) {
    this.workforce().forEach((e, i) => {
      const rt = this.staffRt.get(e.id);
      if (!rt) return;
      const seat = i === 0 ? { dx: 0, dy: 0 } : NIGHT_STAFF_SEATS[i - 1];
      if (!seat) return;
      rt.task = null;
      rt.floor = 0;
      rt.char.setCarrying(false);
      rt.char.teleportTo(NIGHT_SEAT.x + seat.dx, NIGHT_SEAT.y + seat.dy);
      rt.char.setScale(seat.dx > 0 ? -1 : 1, 1);
      rt.char.setMeditating(true);
      rt.char.setVisible(true);
      // 越靠后越低一层，前排压住后排
      rt.char.setDepth(20 + seat.dy / 100);
    });
  }

  /** 雇来的伙计的角色（不含掌柜）。 */
  staffChars(this: TavernScene): Character[] {
    return this.employees.flatMap((e) => this.staffRt.get(e.id)?.char ?? []);
  }

  employeeById(this: TavernScene, id: number | null): Employee | undefined {
    return id === null ? undefined : this.workforce().find((e) => e.id === id);
  }

  /** 干完一件活得经验，升级时写进见闻录。 */
  staffDidWork(this: TavernScene, e: Employee) {
    if (gainExp(e)) this.log(`${e.name}升到 ${e.level} 级，打烊后可去伙计页加点`);
  }

  /** 空闲的人按自己的工作顺序，从上往下取第一件能做的事。跑堂先传菜再领座；采买只在打烊时做。 */
  assignStaffWork(this: TavernScene) {
    const team = this.workforce();
    // 没人勾跑堂时人人兜底，避免客人卡在门口、菜凉在灶台上
    const noRunner = !team.some((e) => e.jobs.some((j) => j.job === "seat" && j.on));
    const jobsOf = (e: Employee) => {
      const jobs = e.jobs.filter((j) => j.on).map((j) => j.job);
      if (noRunner) jobs.push("seat");
      return jobs;
    };
    // 按顺位一轮轮派：先让把这项排第一的人接，同一顺位里属性高的先接——专门的厨子不会被掌柜抢走活
    for (let rank = 0; rank < JOBS.length + 1; rank++) {
      const idle = team
        .filter((e) => !this.staffRt.get(e.id)?.task && jobsOf(e)[rank] !== undefined)
        .sort((a, b) => getEffectiveStars(b, jobsOf(b)[rank]) - getEffectiveStars(a, jobsOf(a)[rank]));
      for (const e of idle) {
        if (this.staffRt.get(e.id)?.task) continue;
        const job = jobsOf(e)[rank];
        if (job === "seat") this.startServe(e) || this.startSeat(e);
        else if (job === "cook") this.startCook(e);
      }
    }
  }

  /** 勾了采买的人里机缘有效星数最高的那位，决定采购折扣；没人勾为 null。 */
  bestBuyer(this: TavernScene): Employee | null {
    const buyers = this.workforce().filter((e) => e.jobs.some((j) => j.job === "buy" && j.on));
    return buyers.reduce<Employee | null>((best, e) => (!best || getEffectiveStars(e, "buy") > getEffectiveStars(best, "buy") ? e : best), null);
  }

  /** 一句话说明当前分工：每项工作有几人在做，没人做菜时提醒营业会卡住。 */
  staffSummaryHint(this: TavernScene): string {
    const count = (job: Job) => this.workforce().filter((e) => e.jobs.some((j) => j.job === job && j.on)).length;
    const parts = JOBS.map((job) => `${JOB_NAMES[job]} ${count(job)} 人`).join(" · ");
    if (count("cook") === 0) return `${parts}（没人做菜，客人会一直等）`;
    if (count("seat") === 0) return `${parts}（没人跑堂，由所有人兜底）`;
    return parts;
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

  /** 打烊时辞退：当天不付工资，也不给遣散费。掌柜不能辞退。 */
  fireStaff(this: TavernScene, e: Employee) {
    if (e.id === SHOPKEEPER_ID) return;
    this.employees = this.employees.filter((o) => o !== e);
    this.pendingFireId = null;
    this.rebuildStaffChars();
    this.save();
    this.staffNotice = `${e.name}已离店`;
    this.staffNoticeGood = true;
    this.log(`辞退了${e.name}`);
  }

  /** 按当前属性结算伙计当日工资（掌柜不领）；可以扣成负数，负数表示欠款。 */
  settleWages(this: TavernScene): { name: string; stars: number; wage: number }[] {
    const details = this.employees.map((e) => ({ name: e.name, stars: getTotalStars(e), wage: getStaffWage(e) }));
    const total = details.reduce((sum, d) => sum + d.wage, 0);
    this.coins -= total;
    this.displayedCoins = this.coins;
    return details;
  }
}
