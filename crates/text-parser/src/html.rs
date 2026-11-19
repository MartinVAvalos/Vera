pub fn sanitize_html(input: &str) -> String {
    ammonia::clean(input)
}
