class ApplicationController < ActionController::API
  rescue_from ActiveRecord::RecordNotFound, with: :not_found
  rescue_from ActionController::ParameterMissing, ActionController::BadRequest, ActionDispatch::Http::Parameters::ParseError do
    render_error("malformed", "Provide a valid JSON request.", :bad_request)
  end
  rescue_from ApiError do |error|
    render_error(error.code, error.message, error.status, error.details)
  end

  def not_found
    render_error("not_found", "We couldn't find that.", :not_found)
  end

  private

  def render_error(code, message, status, details = {})
    render json: { error: { code: code, message: message, details: details } }, status: status
  end
end
