use chrono::{DateTime, Datelike, Days, NaiveDate, Timelike, Utc};
use chrono_tz::Tz;

pub fn resolve_app_timezone() -> String {
    std::env::var("CODEX_USAGE_TIMEZONE")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| iana_time_zone::get_timezone().ok())
        .unwrap_or_else(|| "UTC".to_string())
}

fn parse_timezone(timezone: &str) -> Tz {
    timezone.parse::<Tz>().unwrap_or(chrono_tz::UTC)
}

pub fn date_key_in_timezone(date: DateTime<Utc>, timezone: &str) -> String {
    let local = date.with_timezone(&parse_timezone(timezone));
    format!(
        "{:04}-{:02}-{:02}",
        local.year(),
        local.month(),
        local.day()
    )
}

pub fn hour_key_in_timezone(date: DateTime<Utc>, timezone: &str) -> String {
    let local = date.with_timezone(&parse_timezone(timezone));
    format!(
        "{:04}-{:02}-{:02}T{:02}:00",
        local.year(),
        local.month(),
        local.day(),
        local.hour()
    )
}

pub fn list_hour_keys_until(
    start_date: &str,
    timezone: &str,
    end: DateTime<Utc>,
) -> Result<Vec<String>, String> {
    let mut current = NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .map_err(|error| error.to_string())?
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "invalid start time".to_string())?;
    let end = end
        .with_timezone(&parse_timezone(timezone))
        .naive_local()
        .with_minute(0)
        .and_then(|value| value.with_second(0))
        .and_then(|value| value.with_nanosecond(0))
        .ok_or_else(|| "invalid end time".to_string())?;
    let mut keys = Vec::new();

    while current <= end {
        keys.push(current.format("%Y-%m-%dT%H:00").to_string());
        current = current
            .checked_add_signed(chrono::Duration::hours(1))
            .ok_or_else(|| "hour shift overflow".to_string())?;
    }

    Ok(keys)
}

pub fn shift_date_key(date_key: &str, delta_days: i64) -> Result<String, String> {
    let date =
        NaiveDate::parse_from_str(date_key, "%Y-%m-%d").map_err(|error| error.to_string())?;
    let shifted = if delta_days >= 0 {
        date.checked_add_days(Days::new(delta_days as u64))
    } else {
        date.checked_sub_days(Days::new(delta_days.unsigned_abs()))
    }
    .ok_or_else(|| "date shift overflow".to_string())?;
    Ok(shifted.format("%Y-%m-%d").to_string())
}

pub fn list_date_keys(start_date: &str, end_date: &str) -> Result<Vec<String>, String> {
    let mut keys = Vec::new();
    let mut current = start_date.to_string();

    while current.as_str() <= end_date {
        keys.push(current.clone());
        current = shift_date_key(&current, 1)?;
    }

    Ok(keys)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shifts_date_keys() {
        assert_eq!(shift_date_key("2026-04-01", -1).unwrap(), "2026-03-31");
        assert_eq!(shift_date_key("2026-04-01", 1).unwrap(), "2026-04-02");
    }

    #[test]
    fn lists_hour_keys_in_the_app_timezone() {
        let end = "2026-04-02T02:34:00Z".parse::<DateTime<Utc>>().unwrap();

        let keys = list_hour_keys_until("2026-04-01", "Asia/Shanghai", end).unwrap();

        assert_eq!(keys.first().unwrap(), "2026-04-01T00:00");
        assert_eq!(keys.last().unwrap(), "2026-04-02T10:00");
        assert_eq!(keys.len(), 35);
    }
}
