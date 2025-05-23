defmodule PhoenixTS.MixProject do
  use Mix.Project

  @app :phoenix_ts
  @version "1.7.17"

  def project do
    [
      app: @app,
      version: @version,
      elixir: "~> 1.13",
      deps: [],
      docs: docs(),
      package: packages(),
      description: """
      The unofficial TypeScript client for the Phoenix web framework.
      """
    ]
  end

  defp docs() do
    [
      main: "readme",
      name: "PhoenixTS",
      source_ref: "v#{@version}",
      canonical: "http://hexdocs.pm/phoenix_ts",
      source_url: "https://github.com/tylerbarker/phx_ts",
      extras: ["README.md"]
    ]
  end

  def package do
    [
      name: "phoenix_ts",
      maintainers: ["Tyler Barker"],
      licenses: ["MIT"],
      links: %{"GitHub" => "https://github.com/tylerbarker/phx_ts"},
      files: ~w(mix.exs lib assets README.md LICENSE.md)
    ]
  end
end
