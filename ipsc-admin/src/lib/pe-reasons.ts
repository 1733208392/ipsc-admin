export interface ProceduralReason {
  reason_code: string
  en: string
  zh: string
  sort_order: number
}

export const PROCEDURAL_REASONS: ProceduralReason[] = [
  { reason_code: '10.2.7', en: 'Unengaged target', zh: '未射击靶', sort_order: 1 },
  { reason_code: '2.2.1.5', en: 'Foot fault, cut corner', zh: '踩线犯规，抄近角', sort_order: 2 },
  { reason_code: '10.2.1', en: 'Foot fault while shooting', zh: '射击时踩线犯规', sort_order: 3 },
  { reason_code: '10.2.1.1', en: 'Foot fault while shooting (per shot)', zh: '射击时踩线犯规（每发计）', sort_order: 4 },
  { reason_code: '10.2.2', en: 'Course procedure violation', zh: '赛道程序违规', sort_order: 5 },
  { reason_code: '10.2.2-ps', en: 'Course procedure violation (per shot)', zh: '赛道程序违规（每发计）', sort_order: 6 },
  { reason_code: '10.2.4', en: 'Mandatory reload violation (per shot)', zh: '强制换弹违规（每发计）', sort_order: 7 },
  { reason_code: '10.2.5', en: 'Cooper tunnel violation', zh: 'Cooper 通道违规', sort_order: 8 },
  { reason_code: '10.2.8', en: 'Strong/weak hand only, touching firearm with other hand', zh: '强手/弱手射击时以另一只手触碰枪械', sort_order: 9 },
  { reason_code: '10.2.8.1', en: 'Strong/weak hand only, supporting shooting hand (per shot)', zh: '强手/弱手射击时支撑射击手（每发计）', sort_order: 10 },
  { reason_code: '10.2.8.2', en: 'Strong/weak hand only, using support while shooting (per shot)', zh: '强手/弱手射击时借助支撑物（每发计）', sort_order: 11 },
  { reason_code: '10.2.11', en: 'Shooting over 1.8m barrier (per shot)', zh: '越过 1.8 米障碍射击（每发计）', sort_order: 12 },
  { reason_code: '8.6.2', en: 'Receiving assistance', zh: '获得协助', sort_order: 13 },
  { reason_code: '8.7.2', en: 'Use of aids during walkthrough', zh: '走场时使用辅助工具', sort_order: 14 },
  { reason_code: '10.2.9', en: 'Prohibited action (per shot)', zh: '禁止动作（每发计）', sort_order: 15 },
  { reason_code: '4.6.1', en: 'Altering stage equipment', zh: '改动赛道器材', sort_order: 16 },
  { reason_code: '8.1.3', en: 'Chambering a round by pressing the trigger', zh: '通过扣动扳机使子弹入膛', sort_order: 17 },
  { reason_code: '9.9.2', en: 'Unactivated disappearing target', zh: '未触发的消失靶', sort_order: 18 },
  { reason_code: 'A.D.19', en: 'Production/PO - first shot not in double action', zh: 'Production/PO 组别首发非双动', sort_order: 19 },
  { reason_code: '8.7.1', en: 'Aiming or dry fire (after warning)', zh: '瞄准或空击（警告后）', sort_order: 20 },
  { reason_code: '9.1.1', en: 'Approaching targets (after warning)', zh: '靠近靶位（警告后）', sort_order: 21 },
  { reason_code: '10.2.6', en: 'Movement after Standby command (after warning)', zh: 'Standby 口令后移动（警告后）', sort_order: 22 },
  { reason_code: 'W-5.2.2-10.5.1', en: 'Warning 5.2.2 / 10.5.1 Unauthorized gun handling (DQ 10.5.1)', zh: '警告 5.2.2 / 10.5.1 未经授权操枪（DQ 10.5.1）', sort_order: 23 },
  { reason_code: 'W-6.2.5.1', en: 'Warning 6.2.5.1 Distance to body (in Open or no score)', zh: '警告 6.2.5.1 与身体距离（Open 组或不计成绩）', sort_order: 24 },
  { reason_code: 'W-8.7.1', en: 'Warning 8.7.1 Aiming or dry fire (penalty)', zh: '警告 8.7.1 瞄准或空击（罚分）', sort_order: 25 },
  { reason_code: 'W-9.1.1', en: 'Warning 9.1.1 Approaching targets (penalty)', zh: '警告 9.1.1 靠近靶位（罚分）', sort_order: 26 },
  { reason_code: 'W-10.2.6', en: 'Warning 10.2.6 Movement after Standby command (penalty)', zh: '警告 10.2.6 Standby 口令后移动（罚分）', sort_order: 27 },
  { reason_code: 'W-5.2.1.2', en: 'Warning 5.2.1.2 Magazine and striker/hammer (DQ 10.6.1)', zh: '警告 5.2.1.2 弹匣与击针/击锤（DQ 10.6.1）', sort_order: 28 },
  { reason_code: 'W-8.3.1.1', en: 'Warning 8.3.1.1 Leaving start position after Make Ready (DQ 10.6.1)', zh: '警告 8.3.1.1 Make Ready 后离开起始位置（DQ 10.6.1）', sort_order: 29 },
  { reason_code: 'W-8.7.3', en: 'Warning 8.7.3 Unauthorized entry into course of fire (DQ 10.6)', zh: '警告 8.7.3 未授权进入赛道（DQ 10.6）', sort_order: 30 },
  { reason_code: 'W-9.7.8', en: 'Warning 9.7.8 Unauthorized handling of score sheets (DQ 10.6)', zh: '警告 9.7.8 未授权接触计分表（DQ 10.6）', sort_order: 31 },
]
