/**
 * Memo Aging & Working-Day Calculations Module
 * RCD Memorandum Monitoring System (PRO 4A)
 */

class AgingManager {
  /**
   * Calculates difference in working days (excluding Saturdays and Sundays)
   * between start date and target date.
   */
  calculateWorkingDays(startDateStr, endDateStr = null) {
    if (!startDateStr) return 0;
    try {
      const start = new Date(startDateStr);
      const end = endDateStr ? new Date(endDateStr) : new Date();

      if (isNaN(start.getTime())) return 0;

      let count = 0;
      const cur = new Date(start);
      cur.setHours(0,0,0,0);
      const target = new Date(end);
      target.setHours(0,0,0,0);

      const isReverse = cur > target;
      const step = isReverse ? -1 : 1;

      while (isReverse ? cur > target : cur < target) {
        cur.setDate(cur.getDate() + step);
        const day = cur.getDay();
        if (day !== 0 && day !== 6) { // Skip Sunday (0) and Saturday (6)
          count++;
        }
      }
      return isReverse ? -count : count;
    } catch (e) {
      return 0;
    }
  }

  /**
   * Returns aging status metadata object
   */
  getAgingStatus(memo) {
    if (!memo) return { text: "Normal", badgeClass: "badge-aging-normal", workingDays: 0 };

    const dateLogged = memo.dateLogged;
    const workingDays = this.calculateWorkingDays(dateLogged);

    // If memo is completed or transmitted
    if (memo.workflowStatus === "TRANSMITTED" || memo.workflowStatus === "COMPLETED" || memo.remarksStatus === "Transmitted to") {
      return {
        text: `Completed (${workingDays} days)`,
        badgeClass: "badge-aging-completed",
        workingDays: workingDays,
        isOverdue: false
      };
    }

    if (memo.dueDate) {
      const daysUntilDue = this.calculateWorkingDays(new Date().toLocaleDateString("en-US"), memo.dueDate);
      if (daysUntilDue < 0) {
        const overdueDays = Math.abs(daysUntilDue);
        return {
          text: `⚠️ OVERDUE by ${overdueDays} working day(s)`,
          badgeClass: "badge-aging-overdue",
          workingDays: workingDays,
          isOverdue: true
        };
      } else if (daysUntilDue === 0) {
        return {
          text: "⏰ DUE TODAY",
          badgeClass: "badge-aging-due-today",
          workingDays: workingDays,
          isOverdue: false
        };
      } else if (daysUntilDue <= 2) {
        return {
          text: `⏳ DUE SOON (${daysUntilDue} days left)`,
          badgeClass: "badge-aging-due-soon",
          workingDays: workingDays,
          isOverdue: false
        };
      }
    }

    // Default aging threshold rules
    if (workingDays >= 5) {
      return {
        text: `⚠️ OVERDUE (${workingDays} working days inside RCD)`,
        badgeClass: "badge-aging-overdue",
        workingDays: workingDays,
        isOverdue: true
      };
    } else if (workingDays >= 3) {
      return {
        text: `⏳ Pending ${workingDays} working days`,
        badgeClass: "badge-aging-due-soon",
        workingDays: workingDays,
        isOverdue: false
      };
    }

    return {
      text: `${workingDays} working day(s)`,
      badgeClass: "badge-aging-normal",
      workingDays: workingDays,
      isOverdue: false
    };
  }
}

window.agingManager = new AgingManager();
