"""Revenue, cost and profit of each Smart Operations area (the tabs), for Smart Operations and Finance › Revenue.

An order's money is split over its products: each product line counts for its area (ID Verification, Company
Formation, Registered Address, UK Gov filings) with its share of the order total, and the order's cost (the cost
typed on Finance › Revenue, else the catalogue cost) is split the same way. Cancelled, refunded and draft orders
do not count. The month or year is the order's date, as on Finance › Revenue.
"""
import re

from db import query_db

# First match wins, in this order: a KYC or address line inside a package still counts for its own area
AREAS = [
    ('id-verification', 'ID Verification', re.compile(r'\bkyc\b|id verification|identity verification|aml check', re.I)),
    ('registered-address', 'Registered Address',
     re.compile(r'registered (office|business)?\s*address|registered office|address renewal|mail forwarding', re.I)),
    ('uk-gov-checks', 'UK Gov filings',
     re.compile(r'confirmation statement|annual accounts|dormant accounts|\bpsc\b|change of (director|address|name)'
                r'|director (appointment|change|resignation)|companies house (filing|update)', re.I)),
    ('company-formation', 'Company Formation',
     re.compile(r'formation|incorporat|company registration|register (a )?company|new company|set ?up a company'
                r'|company (set ?up|package)|(digital|professional|all inclusive) package', re.I)),
]


def classify(text):
    for key, _label, pattern in AREAS:
        if pattern.search(str(text or '')):
            return key
    return None


def _money(value):
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def summary(period=None):
    """{'areas': [{key, label, orders, revenue, cost, profit, margin}], 'total': {...}, 'period': period}
    period: 'YYYY-MM', 'YYYY' or None (all time)."""
    from services.invoice_service import resolve_order_cost
    clauses = ["COALESCE(o.is_draft, 0) = 0", "COALESCE(o.status, '') NOT IN ('Cancelled', 'Refunded')"]
    params = []
    period = str(period or '').strip()
    if re.fullmatch(r'\d{4}(-\d{2})?', period):
        clauses.append("strftime(?, o.created_at) = ?")
        params += ['%Y-%m' if len(period) == 7 else '%Y', period]
    else:
        period = None
    orders = query_db(f"""
        SELECT o.id, o.service_name, o.service_id, o.total, o.cost_price FROM orders o
        WHERE {' AND '.join(clauses)};""", tuple(params)) or []
    items = {}
    if orders:
        ids = [o['id'] for o in orders]
        for chunk in range(0, len(ids), 500):
            part = ids[chunk:chunk + 500]
            for it in query_db(f"""SELECT order_id, product_name, category_name, quantity, unit_price, line_total
                                   FROM order_line_items WHERE order_id IN ({','.join('?' * len(part))});""",
                               tuple(part)) or []:
                items.setdefault(it['order_id'], []).append(it)

    acc = {key: {'key': key, 'label': label, 'orders': set(), 'revenue': 0.0, 'cost': 0.0}
           for key, label, _p in AREAS}
    for o in orders:
        total = _money(o.get('total'))
        lines = items.get(o['id']) or [{'product_name': o.get('service_name'), 'category_name': '',
                                        'line_total': total, 'quantity': 1, 'unit_price': total}]
        amounts = [_money(l.get('line_total')) or _money(l.get('unit_price')) * (int(l.get('quantity') or 1))
                   for l in lines]
        lines_sum = sum(amounts)
        areas = [classify(f"{l.get('product_name') or ''} {l.get('category_name') or ''}") for l in lines]
        if not any(areas):
            continue
        cost = _money(resolve_order_cost(o)['cost'])
        for area, amount in zip(areas, amounts):
            if not area:
                continue
            share = (amount / lines_sum) if lines_sum > 0 else 1 / len(lines)
            a = acc[area]
            a['orders'].add(o['id'])
            a['revenue'] += total * share
            a['cost'] += cost * share

    out = []
    for key, _label, _p in AREAS:
        a = acc[key]
        revenue, cost = round(a['revenue'], 2), round(a['cost'], 2)
        profit = round(revenue - cost, 2)
        out.append({'key': key, 'label': a['label'], 'orders': len(a['orders']), 'revenue': revenue, 'cost': cost,
                    'profit': profit, 'margin': round(profit / revenue * 100, 1) if revenue else None})
    rev = round(sum(a['revenue'] for a in out), 2)
    cost = round(sum(a['cost'] for a in out), 2)
    all_orders = set().union(*[acc[k]['orders'] for k in acc])
    total = {'orders': len(all_orders), 'revenue': rev, 'cost': cost, 'profit': round(rev - cost, 2),
             'margin': round((rev - cost) / rev * 100, 1) if rev else None}
    return {'areas': out, 'total': total, 'period': period}
