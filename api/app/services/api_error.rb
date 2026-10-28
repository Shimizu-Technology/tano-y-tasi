class ApiError < StandardError
  attr_reader :code, :details, :status

  def initialize(code, message, details: {}, status: :unprocessable_content)
    super(message)
    @code, @details, @status = code, details, status
  end
end
