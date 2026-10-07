"""Staff incentive grading (ported from app.py calculate_staff_incentive_grade)."""


def calculate_staff_incentive_grade(completed_count, total_assigned, on_time_count, overdue_count):
    completed_count = int(completed_count or 0)
    total_assigned = int(total_assigned or 0)
    on_time_count = int(on_time_count or 0)

    completion_rate = (
        completed_count / total_assigned * 100.0 if total_assigned > 0
        else (100.0 if completed_count > 0 else 0.0)
    )
    sla_rate = on_time_count / completed_count * 100.0 if completed_count > 0 else 100.0

    if completion_rate >= 90.0 and sla_rate >= 85.0 and completed_count >= 1:
        grade, label, badge = 'A+', 'Top Performer (Grade A+)', '100% Incentive Bonus Eligible'
    elif completion_rate >= 80.0 and sla_rate >= 75.0:
        grade, label, badge = 'A', 'High Performer (Grade A)', '85% Incentive Bonus Eligible'
    elif completion_rate >= 65.0:
        grade, label, badge = 'B', 'Good Standing (Grade B)', 'Standard Incentive Bonus'
    elif completion_rate >= 40.0:
        grade, label, badge = 'C', 'Needs Improvement (Grade C)', 'Partial Incentive Tier'
    else:
        grade, label, badge = 'D', 'Underperforming (Grade D)', 'Incentive Locked'

    return {
        'grade': grade,
        'status_label': label,
        'bonus_badge': badge,
        'completion_rate': round(completion_rate, 1),
        'sla_rate': round(sla_rate, 1),
    }
