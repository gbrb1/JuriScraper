using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ScraperJuridico.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Processos",
                columns: table => new
                {
                    NumeroProcesso = table.Column<string>(type: "text", nullable: false),
                    Tribunal = table.Column<string>(type: "text", nullable: false),
                    Classe = table.Column<string>(type: "text", nullable: false),
                    Assunto = table.Column<string>(type: "text", nullable: false),
                    Foro = table.Column<string>(type: "text", nullable: false),
                    DataDistribuicao = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UltimoAndamento = table.Column<string>(type: "text", nullable: false),
                    DataUltimoAndamento = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Processos", x => new { x.NumeroProcesso, x.Tribunal });
                });

            migrationBuilder.CreateTable(
                name: "Partes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ProcessoNumeroProcesso = table.Column<string>(type: "text", nullable: false),
                    Tribunal = table.Column<string>(type: "text", nullable: false),
                    Tipo = table.Column<string>(type: "text", nullable: false),
                    Nome = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Partes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Partes_Processos_ProcessoNumeroProcesso_Tribunal",
                        columns: x => new { x.ProcessoNumeroProcesso, x.Tribunal },
                        principalTable: "Processos",
                        principalColumns: new[] { "NumeroProcesso", "Tribunal" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Partes_ProcessoNumeroProcesso_Tribunal",
                table: "Partes",
                columns: new[] { "ProcessoNumeroProcesso", "Tribunal" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Partes");

            migrationBuilder.DropTable(
                name: "Processos");
        }
    }
}
