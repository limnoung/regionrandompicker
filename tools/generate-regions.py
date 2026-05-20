import json
import math
from pathlib import Path

SI = "시"
GUN = "군"
METRO = "광역시"
SPECIAL = "특별자치시"

SOURCE_GEOJSON = Path(r"C:\tmp\skorea-municipalities-2018-geo.json")
OUTPUT_JS = Path(__file__).resolve().parents[1] / "data" / "regions.js"

PROVINCE_BY_PREFIX = {
    "31": "경기도",
    "32": "강원특별자치도",
    "33": "충청북도",
    "34": "충청남도",
    "35": "전북특별자치도",
    "36": "전라남도",
    "37": "경상북도",
    "38": "경상남도",
}

METRO_BY_PREFIX = {
    "21": "부산광역시",
    "22": "대구광역시",
    "23": "인천광역시",
    "24": "광주광역시",
    "25": "대전광역시",
    "26": "울산광역시",
}

EXCLUDED_GYEONGGI = {
    "과천시",
    "성남시",
    "광명시",
    "부천시",
    "안양시",
    "하남시",
    "구리시",
    "의정부시",
    "고양시",
    "남양주시",
    "김포시",
    "시흥시",
    "군포시",
    "의왕시",
    "수원시",
    "용인시",
    "안산시",
    "화성시",
    "파주시",
    "양주시",
    "광주시",
}

EXCLUDED_REGIONS = {
    "경상북도 울릉군",
}


def ring_area_centroid(ring):
    area2 = 0.0
    cx6 = 0.0
    cy6 = 0.0
    for index in range(len(ring) - 1):
        x1, y1 = ring[index]
        x2, y2 = ring[index + 1]
        cross = x1 * y2 - x2 * y1
        area2 += cross
        cx6 += (x1 + x2) * cross
        cy6 += (y1 + y2) * cross

    if abs(area2) < 1e-12:
        return 0.0, sum(x for x, _ in ring) / len(ring), sum(y for _, y in ring) / len(ring)

    return area2 / 2.0, cx6 / (3.0 * area2), cy6 / (3.0 * area2)


def geometry_area_centroid(geometry):
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    total_area = 0.0
    sx = 0.0
    sy = 0.0

    for polygon in polygons:
        area, cx, cy = ring_area_centroid(polygon[0])
        abs_area = abs(area)
        if abs_area == 0:
            continue
        total_area += abs_area
        sx += abs_area * cx
        sy += abs_area * cy

    return total_area, sx / total_area, sy / total_area


def base_name(name):
    if name.endswith(GUN) or name.endswith(SI):
        return name
    if SI in name:
        return name[: name.index(SI) + 1]
    return name


def main():
    data = json.loads(SOURCE_GEOJSON.read_text(encoding="utf-8"))
    groups = {}

    for feature in data["features"]:
        name = feature["properties"]["name"]
        prefix = feature["properties"]["code"][:2]
        area, lng, lat = geometry_area_centroid(feature["geometry"])

        if prefix in METRO_BY_PREFIX:
            full_name = METRO_BY_PREFIX[prefix]
            meta = {
                "fullName": full_name,
                "province": full_name,
                "name": full_name,
                "type": METRO,
            }
        elif prefix == "29":
            full_name = "세종특별자치시"
            meta = {
                "fullName": full_name,
                "province": full_name,
                "name": full_name,
                "type": SPECIAL,
            }
        elif prefix == "37" and name == "군위군":
            full_name = "대구광역시"
            meta = {
                "fullName": full_name,
                "province": full_name,
                "name": full_name,
                "type": METRO,
            }
        elif prefix in PROVINCE_BY_PREFIX:
            candidate_name = base_name(name)
            if prefix == "31" and candidate_name in EXCLUDED_GYEONGGI:
                continue

            province = PROVINCE_BY_PREFIX[prefix]
            full_name = f"{province} {candidate_name}"
            if full_name in EXCLUDED_REGIONS:
                continue
            meta = {
                "fullName": full_name,
                "province": province,
                "name": candidate_name,
                "type": GUN if candidate_name.endswith(GUN) else SI,
            }
        else:
            continue

        group = groups.setdefault(full_name, {**meta, "area": 0.0, "sx": 0.0, "sy": 0.0})
        group["area"] += area
        group["sx"] += area * lng
        group["sy"] += area * lat

    regions = []
    for item in groups.values():
        regions.append(
            {
                "fullName": item["fullName"],
                "province": item["province"],
                "name": item["name"],
                "type": item["type"],
                "lat": round(item["sy"] / item["area"], 6),
                "lng": round(item["sx"] / item["area"], 6),
            }
        )

    regions.sort(key=lambda region: (region["province"], region["type"], region["name"]))
    payload = json.dumps(regions, ensure_ascii=False, indent=2)
    OUTPUT_JS.write_text(f"window.CANDIDATE_REGIONS = {payload};\n", encoding="utf-8")
    print(f"Wrote {len(regions)} regions to {OUTPUT_JS}")


if __name__ == "__main__":
    main()
