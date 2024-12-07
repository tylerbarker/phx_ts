defmodule PhoenixTS.MixProject do
  use Mix.Project

  @app :phoenix_ts
  @version "1.7.14"

  def project do
    [
      app: @app,
      version: @version,
      elixir: "~> 1.15",
      description: "The unofficial TypeScript client for the Phoenix web framework.",
      deps: [],
      package: [
        name: "phoenix_ts",
        files: ~w(mix.exs README.md priv),
        licenses: ["MIT"],
        links: %{"GitHub" => "https://github.com/tylerbarker/phx_ts"}
      ]
    ]
  end
end
